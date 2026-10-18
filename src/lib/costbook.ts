import "server-only";
import { db } from "./db";
import { Prisma } from "@prisma/client";
import { costOrder, round2, tierKey, uncostedOrder, type CostBook, type Tier } from "./costing";

/** Loads every cost tier and variant cost into memory for fast order costing. */
export async function loadCostBook(fallbackCogsPercent: number): Promise<CostBook> {
  const [tiers, variants] = await Promise.all([
    db.costTier.findMany({ orderBy: { quantity: "asc" } }),
    db.productVariant.findMany({ select: { id: true, shopifyId: true, productId: true, unitCost: true } }),
  ]);
  const book: CostBook = {
    tiers: new Map(),
    shopifyUnitCost: new Map(),
    productOf: new Map(),
    internalId: new Map(),
    fallbackCogsPercent,
  };
  for (const t of tiers) {
    let byVariant = book.tiers.get(t.productId);
    if (!byVariant) {
      byVariant = new Map<string, Tier[]>();
      book.tiers.set(t.productId, byVariant);
    }
    const key = tierKey(t.variantId, t.country);
    const list = byVariant.get(key) ?? [];
    list.push({ quantity: t.quantity, productCost: t.productCost, shippingCost: t.shippingCost });
    byVariant.set(key, list);
  }
  for (const v of variants) {
    if (v.unitCost !== null) book.shopifyUnitCost.set(v.shopifyId, v.unitCost);
    if (v.productId) book.productOf.set(v.shopifyId, v.productId);
    book.internalId.set(v.shopifyId, v.id);
  }
  return book;
}

export type RepriceResult = { orders: number; changed: number };

const differs = (a: number, b: number) => Math.abs(a - b) >= 0.005;

/**
 * Re-prices stored orders with the current product costs and Expenses
 * assumptions. Scoped to orders containing any of `productIds` when given.
 * Only rows whose numbers actually change are written, in bulk.
 */
export async function repriceOrders(scope: { productIds?: string[] } = {}): Promise<RepriceResult> {
  const settings = await db.settings.findUnique({ where: { id: "default" } });
  const cfg = {
    paymentFeePercent: settings?.paymentFeePercent ?? 0,
    paymentFeeFixed: settings?.paymentFeeFixed ?? 0,
    platformFeePercent: settings?.platformFeePercent ?? 0,
    defaultShippingCost: settings?.defaultShippingCost ?? 0,
    defaultHandlingCost: settings?.defaultHandlingCost ?? 0,
  };
  const book = await loadCostBook(settings?.defaultCogsPercent ?? 0);
  const shopifyIdOf = new Map<string, string>();
  for (const [shopifyId, id] of book.internalId) shopifyIdOf.set(id, shopifyId);

  const orders = await db.order.findMany({
    where: scope.productIds ? { lineItems: { some: { variant: { productId: { in: scope.productIds } } } } } : {},
    select: {
      id: true, country: true, cancelledAt: true, total: true, cogs: true, shippingCost: true, handlingCost: true,
      transactionFees: true, platformFees: true, feesEstimated: true,
      lineItems: { select: { id: true, variantId: true, quantity: true, price: true, unitCost: true, shippingCost: true, costSource: true } },
    },
  });

  const lineRows: Prisma.Sql[] = [];
  const orderRows: Prisma.Sql[] = [];
  for (const o of orders) {
    const input = o.lineItems.map((li) => ({
      variantShopifyId: li.variantId ? (shopifyIdOf.get(li.variantId) ?? null) : null,
      quantity: li.quantity,
      price: li.price,
    }));
    // Cancelled orders never shipped: no product, shipping or handling cost.
    const result = o.cancelledAt ? uncostedOrder(input) : costOrder(book, input, cfg.defaultShippingCost, o.country);
    o.lineItems.forEach((li, i) => {
      const c = result.lines[i];
      if (Math.abs(li.unitCost - c.unitCost) > 1e-9 || differs(li.shippingCost, c.shippingCost) || li.costSource !== c.source) {
        lineRows.push(Prisma.sql`(${li.id}, ${c.unitCost}::float8, ${c.shippingCost}::float8, ${c.source})`);
      }
    });
    const handlingCost = o.lineItems.length && !o.cancelledAt ? cfg.defaultHandlingCost : 0;
    const platformFees = round2(o.total * (cfg.platformFeePercent / 100));
    const transactionFees =
      o.feesEstimated === true ? (o.total === 0 ? 0 : round2(o.total * (cfg.paymentFeePercent / 100) + cfg.paymentFeeFixed)) : o.transactionFees;
    if (
      differs(o.cogs, result.cogs) ||
      differs(o.shippingCost, result.shippingCost) ||
      differs(o.handlingCost, handlingCost) ||
      differs(o.platformFees, platformFees) ||
      differs(o.transactionFees, transactionFees)
    ) {
      orderRows.push(
        Prisma.sql`(${o.id}, ${result.cogs}::float8, ${result.shippingCost}::float8, ${handlingCost}::float8, ${platformFees}::float8, ${transactionFees}::float8)`,
      );
    }
  }

  const CHUNK = 500;
  const writes: Prisma.PrismaPromise<number>[] = [];
  for (let i = 0; i < lineRows.length; i += CHUNK) {
    writes.push(db.$executeRaw`
      UPDATE "OrderLineItem" AS li
      SET "unitCost" = v.u, "shippingCost" = v.s, "costSource" = v.c
      FROM (VALUES ${Prisma.join(lineRows.slice(i, i + CHUNK))}) AS v(id, u, s, c)
      WHERE li.id = v.id`);
  }
  for (let i = 0; i < orderRows.length; i += CHUNK) {
    writes.push(db.$executeRaw`
      UPDATE "Order" AS o
      SET "cogs" = v.cogs, "shippingCost" = v.ship, "handlingCost" = v.handling, "platformFees" = v.platform, "transactionFees" = v.fees
      FROM (VALUES ${Prisma.join(orderRows.slice(i, i + CHUNK))}) AS v(id, cogs, ship, handling, platform, fees)
      WHERE o.id = v.id`);
  }
  if (writes.length) await db.$transaction(writes);
  return { orders: orders.length, changed: orderRows.length };
}

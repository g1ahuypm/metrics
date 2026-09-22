import "server-only";
import { db } from "./db";
import type { CostBook, Tier } from "./costing";

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
    const list = byVariant.get(t.variantId) ?? [];
    list.push({ quantity: t.quantity, productCost: t.productCost, shippingCost: t.shippingCost });
    byVariant.set(t.variantId, list);
  }
  for (const v of variants) {
    if (v.unitCost !== null) book.shopifyUnitCost.set(v.shopifyId, v.unitCost);
    if (v.productId) book.productOf.set(v.shopifyId, v.productId);
    book.internalId.set(v.shopifyId, v.id);
  }
  return book;
}

/** Recosts every stored order with the current cost book. Returns the number of orders updated. */
export async function recostAllOrders(): Promise<number> {
  const settings = await db.settings.findUnique({ where: { id: "default" } });
  const book = await loadCostBook(settings?.defaultCogsPercent ?? 0);
  const { costOrder } = await import("./costing");
  const variantsById = await db.productVariant.findMany({ select: { id: true, shopifyId: true } });
  const shopifyIdOf = new Map(variantsById.map((v) => [v.id, v.shopifyId]));

  const orders = await db.order.findMany({
    select: { id: true, lineItems: { select: { id: true, variantId: true, quantity: true, price: true } } },
  });
  let updated = 0;
  for (const o of orders) {
    const result = costOrder(
      book,
      o.lineItems.map((li) => ({
        variantShopifyId: li.variantId ? (shopifyIdOf.get(li.variantId) ?? null) : null,
        quantity: li.quantity,
        price: li.price,
      })),
      settings?.defaultShippingCost ?? 0,
    );
    await db.$transaction([
      ...o.lineItems.map((li, i) =>
        db.orderLineItem.update({
          where: { id: li.id },
          data: { unitCost: result.lines[i].unitCost, shippingCost: result.lines[i].shippingCost, costSource: result.lines[i].source },
        }),
      ),
      db.order.update({ where: { id: o.id }, data: { cogs: result.cogs, shippingCost: result.shippingCost } }),
    ]);
    updated++;
  }
  return updated;
}

import "server-only";
import { subDays } from "date-fns";
import { db } from "../db";
import { costOrder } from "../costing";
import { loadCostBook } from "../costbook";
import type { IntegrationConfig } from "./config";

const API_VERSION = "2025-07";

type Money = { shopMoney: { amount: string } };

type ShopifyOrder = {
  id: string;
  name: string;
  createdAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  currencyCode: string;
  sourceName: string | null;
  tags: string[];
  currentSubtotalPriceSet: Money;
  currentTotalPriceSet: Money;
  currentTotalTaxSet: Money;
  currentTotalDiscountsSet: Money;
  totalShippingPriceSet: Money;
  totalRefundedSet: Money;
  customer: { id: string; defaultEmailAddress: { emailAddress: string | null } | null } | null;
  lineItems: {
    nodes: {
      id: string;
      title: string;
      sku: string | null;
      quantity: number;
      discountedTotalSet: Money;
      variant: { id: string; inventoryItem: { unitCost: { amount: string } | null } | null } | null;
    }[];
  };
  transactions: {
    kind: string;
    status: string;
    fees: { amount: { amount: string } }[];
  }[];
};

type ShopifyVariant = {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  media: { nodes: { preview: { image: { url: string } | null } | null }[] };
  product: { id: string; title: string; featuredMedia: { preview: { image: { url: string } | null } | null } | null };
  inventoryItem: { unitCost: { amount: string } | null } | null;
};

const num = (m: Money | null | undefined) => (m ? Number(m.shopMoney.amount) : 0);

export async function shopifyGraphQL<T>(
  cfg: { domain: string; token: string },
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`https://${cfg.domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": cfg.token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("Shopify GraphQL returned no data");
  return json.data;
}

/** Quick connectivity check used by the settings page. Returns the shop name. */
export async function testShopify(cfg: { domain: string; token: string }): Promise<string> {
  const data = await shopifyGraphQL<{ shop: { name: string; currencyCode: string } }>(
    cfg,
    `{ shop { name currencyCode } }`,
  );
  return `${data.shop.name} (${data.shop.currencyCode})`;
}

const VARIANTS_QUERY = `
query Variants($cursor: String) {
  productVariants(first: 250, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title sku price
      media(first: 1) { nodes { preview { image { url } } } }
      product { id title featuredMedia { preview { image { url } } } }
      inventoryItem { unitCost { amount } }
    }
  }
}`;

const ORDERS_QUERY = `
query Orders($cursor: String, $query: String) {
  orders(first: 100, after: $cursor, query: $query, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt processedAt cancelledAt
      displayFinancialStatus displayFulfillmentStatus currencyCode sourceName tags
      currentSubtotalPriceSet { shopMoney { amount } }
      currentTotalPriceSet { shopMoney { amount } }
      currentTotalTaxSet { shopMoney { amount } }
      currentTotalDiscountsSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      totalRefundedSet { shopMoney { amount } }
      customer { id defaultEmailAddress { emailAddress } }
      lineItems(first: 100) {
        nodes {
          id title sku quantity
          discountedTotalSet { shopMoney { amount } }
          variant { id inventoryItem { unitCost { amount } } }
        }
      }
      transactions { kind status fees { amount { amount } } }
    }
  }
}`;

export async function syncShopifyVariants(cfg: IntegrationConfig): Promise<number> {
  if (!cfg.shopify) throw new Error("Shopify is not connected");
  let cursor: string | null = null;
  let count = 0;
  do {
    const data: {
      productVariants: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyVariant[] };
    } = await shopifyGraphQL(cfg.shopify, VARIANTS_QUERY, { cursor });
    for (const v of data.productVariants.nodes) {
      const unitCost = v.inventoryItem?.unitCost ? Number(v.inventoryItem.unitCost.amount) : null;
      await db.productVariant.upsert({
        where: { shopifyId: v.id },
        create: {
          shopifyId: v.id,
          productId: v.product.id,
          productTitle: v.product.title,
          variantTitle: v.title,
          sku: v.sku,
          price: Number(v.price),
          unitCost,
          costSource: "shopify",
          imageUrl: v.media.nodes[0]?.preview?.image?.url ?? v.product.featuredMedia?.preview?.image?.url ?? null,
        },
        update: {
          productId: v.product.id,
          productTitle: v.product.title,
          variantTitle: v.title,
          sku: v.sku,
          price: Number(v.price),
          imageUrl: v.media.nodes[0]?.preview?.image?.url ?? v.product.featuredMedia?.preview?.image?.url ?? null,
          unitCost,
        },
      });
      count++;
    }
    cursor = data.productVariants.pageInfo.hasNextPage ? data.productVariants.pageInfo.endCursor : null;
  } while (cursor);
  return count;
}

export async function syncShopifyOrders(cfg: IntegrationConfig, since: Date): Promise<number> {
  if (!cfg.shopify) throw new Error("Shopify is not connected");

  // Supplier cost tiers (Product costs page) win over Shopify's cost per item.
  const book = await loadCostBook(cfg.defaultCogsPercent);

  let cursor: string | null = null;
  let count = 0;
  const query = `updated_at:>='${since.toISOString()}'`;

  do {
    const data: {
      orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyOrder[] };
    } = await shopifyGraphQL(cfg.shopify, ORDERS_QUERY, { cursor, query });

    for (const o of data.orders.nodes) {
      const total = num(o.currentTotalPriceSet);
      // A variant seen on an order but not yet in the cost book (new product) falls back to
      // the unit cost Shopify reports on the line itself.
      for (const li of o.lineItems.nodes) {
        if (li.variant && !book.shopifyUnitCost.has(li.variant.id) && li.variant.inventoryItem?.unitCost) {
          book.shopifyUnitCost.set(li.variant.id, Number(li.variant.inventoryItem.unitCost.amount));
        }
      }
      const costed = costOrder(
        book,
        o.lineItems.nodes.map((li) => ({
          variantShopifyId: li.variant?.id ?? null,
          quantity: li.quantity,
          price: num(li.discountedTotalSet),
        })),
        cfg.defaultShippingCost,
      );
      const lineItems = o.lineItems.nodes.map((li, i) => ({
        shopifyId: li.id,
        variantId: li.variant ? (book.internalId.get(li.variant.id) ?? null) : null,
        title: li.title,
        sku: li.sku,
        quantity: li.quantity,
        price: num(li.discountedTotalSet),
        unitCost: costed.lines[i].unitCost,
        shippingCost: costed.lines[i].shippingCost,
        costSource: costed.lines[i].source,
      }));

      const cogs = costed.cogs;
      const itemCount = lineItems.reduce((s, li) => s + li.quantity, 0);

      const feeFromShopify = o.transactions
        .filter((t) => t.status === "SUCCESS" && (t.kind === "SALE" || t.kind === "CAPTURE"))
        .reduce((s, t) => s + t.fees.reduce((fs, f) => fs + Number(f.amount.amount), 0), 0);
      const transactionFees =
        feeFromShopify > 0 || total === 0
          ? feeFromShopify
          : total * (cfg.paymentFeePercent / 100) + cfg.paymentFeeFixed;
      const platformFees = total * (cfg.platformFeePercent / 100);

      const base = {
        name: o.name,
        createdAt: new Date(o.createdAt),
        processedAt: o.processedAt ? new Date(o.processedAt) : null,
        cancelledAt: o.cancelledAt ? new Date(o.cancelledAt) : null,
        financialStatus: o.displayFinancialStatus,
        fulfillmentStatus: o.displayFulfillmentStatus,
        currency: o.currencyCode,
        subtotal: num(o.currentSubtotalPriceSet),
        shippingCharged: num(o.totalShippingPriceSet),
        tax: num(o.currentTotalTaxSet),
        discounts: num(o.currentTotalDiscountsSet),
        total,
        refunded: num(o.totalRefundedSet),
        cogs,
        shippingCost: costed.shippingCost,
        handlingCost: cfg.defaultHandlingCost,
        transactionFees,
        platformFees,
        customerId: o.customer?.id ?? null,
        customerEmail: o.customer?.defaultEmailAddress?.emailAddress ?? null,
        itemCount,
        source: o.sourceName,
        tags: o.tags.join(", "),
      };

      const existing = await db.order.findUnique({ where: { shopifyId: o.id }, select: { id: true } });
      if (existing) {
        await db.$transaction([
          db.orderLineItem.deleteMany({ where: { orderId: existing.id } }),
          db.order.update({
            where: { id: existing.id },
            data: { ...base, lineItems: { create: lineItems } },
          }),
        ]);
      } else {
        await db.order.create({ data: { shopifyId: o.id, ...base, lineItems: { create: lineItems } } });
      }
      count++;
    }
    cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
  } while (cursor);

  await recomputeNewCustomers();
  return count;
}

/** Marks each customer's earliest order as their first (new-customer) order. */
export async function recomputeNewCustomers(): Promise<void> {
  const firsts = await db.order.groupBy({
    by: ["customerId"],
    where: { customerId: { not: null } },
    _min: { createdAt: true },
  });
  await db.$transaction(async (tx) => {
    await tx.order.updateMany({ where: { customerId: { not: null } }, data: { isNewCustomer: false } });
    for (const f of firsts) {
      if (!f.customerId || !f._min.createdAt) continue;
      await tx.order.updateMany({
        where: { customerId: f.customerId, createdAt: f._min.createdAt },
        data: { isNewCustomer: true },
      });
    }
  });
}

export async function syncShopify(cfg: IntegrationConfig): Promise<{ variants: number; orders: number }> {
  const variants = await syncShopifyVariants(cfg);
  // Re-pull the last few days on every run so refunds and edits are captured;
  // pull 90 days of history on the first run.
  const since = cfg.lastShopifySyncAt ? subDays(cfg.lastShopifySyncAt, 3) : subDays(new Date(), 90);
  const orders = await syncShopifyOrders(cfg, since);
  await db.settings.update({ where: { id: "default" }, data: { lastShopifySyncAt: new Date() } });
  return { variants, orders };
}

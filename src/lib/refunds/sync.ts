import "server-only";
import { subDays } from "date-fns";
import { db } from "../db";
import type { StoreConfig } from "../integrations/config";
import { shopifyGraphQL, ShopifyGraphQLError } from "../integrations/shopify";

// Refunds for the Refunds page, read from Shopify's refund transactions (the money) and refunds (the items).
// One click on "Refund" in Shopify can create several transactions (one per charge on the order) and a
// separate $0 refund that only records the returned items, so everything made together counts as one refund.

const QUERY = `
query Refunds($cursor: String, $query: String) {
  orders(first: 10, after: $cursor, query: $query, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name displayFinancialStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      __CUSTOMER__
      transactions(first: 15) { id kind status createdAt amountSet { shopMoney { amount currencyCode } } }
      refunds(first: 5) { id createdAt note refundLineItems(first: 10) { nodes { quantity lineItem { title } } } }
    }
  }
}`;
const CUSTOMER = "email customer { firstName lastName }";

type Money = { shopMoney: { amount: string; currencyCode: string } };
export type RefundOrderNode = {
  id: string;
  name: string;
  displayFinancialStatus: string | null;
  totalPriceSet: Money;
  email?: string | null;
  customer?: { firstName: string | null; lastName: string | null } | null;
  transactions: { id: string; kind: string; status: string; createdAt: string; amountSet: Money }[];
  refunds: { id: string; createdAt: string; note: string | null; refundLineItems: { nodes: { quantity: number; lineItem: { title: string } }[] } }[];
};

export type RefundEvent = {
  key: string;
  refundedAt: Date;
  amount: number;
  currency: string;
  status: "pending" | "processed" | "failed";
  full: boolean;
  items: string | null;
  note: string | null;
};

/** Transactions made within this long of each other are one refund. */
const SAME_REFUND_MS = 10 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Groups an order's refund transactions into refunds, with their items and status. Exported for tests. */
export function refundEvents(o: RefundOrderNode): RefundEvent[] {
  const txs = o.transactions.filter((t) => t.kind === "REFUND").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const groups: (typeof txs)[] = [];
  for (const t of txs) {
    const last = groups[groups.length - 1];
    if (last && Date.parse(t.createdAt) - Date.parse(last[last.length - 1].createdAt) <= SAME_REFUND_MS) last.push(t);
    else groups.push([t]);
  }
  const orderTotal = Number(o.totalPriceSet.shopMoney.amount);
  // Money that is (or will be) back with the customer across the whole order, to tell full from partial.
  const refundedOnOrder = txs.filter((t) => t.status !== "FAILURE" && t.status !== "ERROR").reduce((s, t) => s + Number(t.amountSet.shopMoney.amount), 0);
  return groups.map((g) => {
    const start = Date.parse(g[0].createdAt);
    const end = Date.parse(g[g.length - 1].createdAt);
    const ok = g.filter((t) => t.status !== "FAILURE" && t.status !== "ERROR");
    const status = ok.length === 0 ? "failed" : ok.some((t) => t.status !== "SUCCESS") ? "pending" : "processed";
    const near = o.refunds.filter((r) => Date.parse(r.createdAt) >= start - SAME_REFUND_MS && Date.parse(r.createdAt) <= end + SAME_REFUND_MS);
    const counts = new Map<string, number>();
    for (const r of near) for (const li of r.refundLineItems.nodes) counts.set(li.lineItem.title, (counts.get(li.lineItem.title) ?? 0) + li.quantity);
    const note = near.map((r) => r.note?.trim()).find(Boolean) ?? null;
    return {
      key: g[0].id,
      refundedAt: new Date(start),
      amount: round2((ok.length ? ok : g).reduce((s, t) => s + Number(t.amountSet.shopMoney.amount), 0)),
      currency: g[0].amountSet.shopMoney.currencyCode,
      status,
      full: orderTotal > 0 && refundedOnOrder >= orderTotal - 0.01,
      items: counts.size ? [...counts].map(([title, q]) => `${q}× ${title}`).join(", ") : null,
      note,
    };
  });
}

/** True when two ways of writing an order number mean the same order: "#LW001473", "lw1473", "1473". */
export function sameOrder(a: string, b: string): boolean {
  const parse = (x: string) => {
    const m = x.trim().replace(/^#/, "").toUpperCase().match(/^([A-Z]*)\s*0*(\d+)$/);
    return m ? { letters: m[1], num: Number(m[2]) } : null;
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb || pa.num !== pb.num) return false;
  return !pa.letters || !pb.letters || pa.letters === pb.letters;
}

/**
 * Brings in refunds made in Shopify. The first time it reads 60 days of refunded orders; after that,
 * orders changed since the last sync (a pending refund leaves the order "Paid", so status can't be the filter).
 */
export async function syncRefunds(cfg: StoreConfig): Promise<number> {
  if (!cfg.shopify) return 0;
  const first = (await db.refund.count({ where: { storeId: cfg.storeId } })) === 0;
  const since = first || !cfg.lastShopifySyncAt ? subDays(new Date(), 60) : subDays(cfg.lastShopifySyncAt, 1);
  const query = first
    ? `updated_at:>='${since.toISOString()}' AND (financial_status:refunded OR financial_status:partially_refunded OR updated_at:>='${subDays(new Date(), 7).toISOString()}')`
    : `updated_at:>='${since.toISOString()}'`;
  let withCustomer = true;
  let cursor: string | null = null;
  let saved = 0;
  do {
    type Page = { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: RefundOrderNode[] } };
    let data: Page;
    try {
      data = await shopifyGraphQL<Page>(cfg.shopify, QUERY.replace("__CUSTOMER__", withCustomer ? CUSTOMER : ""), { cursor, query });
    } catch (err) {
      // Customer details are protected data; without access the refunds still come in.
      if (withCustomer && err instanceof ShopifyGraphQLError && /customer|protected|email/i.test(err.message)) {
        withCustomer = false;
        data = await shopifyGraphQL<Page>(cfg.shopify, QUERY.replace("__CUSTOMER__", ""), { cursor, query });
      } else throw err;
    }
    for (const o of data.orders.nodes) {
      const events = refundEvents(o);
      if (!events.length) continue;
      const customerName = [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(" ").trim() || null;
      for (const e of events) {
        const facts = { orderShopifyId: o.id, orderName: o.name, customerName, customerEmail: o.email?.toLowerCase() ?? null, ...e };
        await db.refund.upsert({
          where: { storeId_key: { storeId: cfg.storeId, key: e.key } },
          create: { storeId: cfg.storeId, ...facts },
          // The team's follow-up (email, return) is never touched by a sync.
          update: facts,
        });
        saved++;
      }
      // A refund the team had planned for this order is now in Shopify.
      const planned = await db.plannedRefund.findMany({ where: { storeId: cfg.storeId, doneAt: null }, select: { id: true, orderName: true } });
      const done = planned.filter((p) => sameOrder(p.orderName, o.name)).map((p) => p.id);
      if (done.length) await db.plannedRefund.updateMany({ where: { id: { in: done } }, data: { doneAt: new Date() } });
    }
    cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
  } while (cursor);
  return saved;
}

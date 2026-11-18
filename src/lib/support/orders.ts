import "server-only";
import { getStoreConfig } from "../integrations/config";
import { shopifyGraphQL } from "../integrations/shopify";

/** What support needs to know about one Shopify order. */
export type SupportOrder = {
  name: string;
  placedAt: string;
  cancelled: boolean;
  paymentStatus: string;
  fulfillmentStatus: string;
  total: string;
  shipTo: string;
  items: string[];
  shipments: { shippedAt: string; status: string; carrier: string | null; tracking: string | null; trackingUrl: string | null; deliveredAt: string | null }[];
  /** e.g. "124.98 USD refund started 2026-11-18, still pending", "59.99 USD refunded on 2026-11-04 (completed)" */
  refunds?: string[];
};

const ORDER_FIELDS = `
  name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
  currentTotalPriceSet { shopMoney { amount currencyCode } }
  shippingAddress { city provinceCode countryCodeV2 }
  lineItems(first: 10) { nodes { title currentQuantity } }
  fulfillments(first: 5) { createdAt displayStatus deliveredAt trackingInfo(first: 3) { company number url } }
  transactions(first: 15) { kind status createdAt amountSet { shopMoney { amount currencyCode } } }`;

type Node = {
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  shippingAddress: { city: string | null; provinceCode: string | null; countryCodeV2: string | null } | null;
  lineItems: { nodes: { title: string; currentQuantity: number }[] };
  fulfillments: { createdAt: string; displayStatus: string | null; deliveredAt: string | null; trackingInfo: { company: string | null; number: string | null; url: string | null }[] }[];
  transactions?: Tx[];
};

const tidy = (s: string | null | undefined) => (s ? s.toLowerCase().replace(/_/g, " ") : "unknown");

type Tx = { kind: string; status: string; createdAt: string; amountSet: { shopMoney: { amount: string; currencyCode: string } } };

/** Refund transactions, one line per day and status, so the AI never calls a pending refund done. */
function refundLines(txs: Tx[]): string[] {
  const groups = new Map<string, { amount: number; currency: string; day: string; status: string }>();
  for (const t of txs) {
    if (t.kind !== "REFUND") continue;
    const day = t.createdAt.slice(0, 10);
    const status = t.status === "SUCCESS" ? "completed" : t.status === "PENDING" ? "pending" : "failed";
    const k = `${day}:${status}`;
    const g = groups.get(k) ?? { amount: 0, currency: t.amountSet.shopMoney.currencyCode, day, status };
    g.amount += Number(t.amountSet.shopMoney.amount);
    groups.set(k, g);
  }
  return [...groups.values()].map((g) => {
    const amt = `${g.amount.toFixed(2)} ${g.currency}`;
    if (g.status === "completed") return `${amt} refunded on ${g.day} (completed)`;
    if (g.status === "pending") return `${amt} refund started ${g.day}, still pending (being processed, not completed)`;
    return `${amt} refund attempted ${g.day} failed`;
  });
}

function toSupportOrder(o: Node): SupportOrder {
  return {
    name: o.name,
    placedAt: o.createdAt,
    cancelled: o.cancelledAt !== null,
    paymentStatus: tidy(o.displayFinancialStatus),
    fulfillmentStatus: tidy(o.displayFulfillmentStatus),
    total: `${o.currentTotalPriceSet.shopMoney.amount} ${o.currentTotalPriceSet.shopMoney.currencyCode}`,
    shipTo: [o.shippingAddress?.city, o.shippingAddress?.provinceCode, o.shippingAddress?.countryCodeV2].filter(Boolean).join(", "),
    items: o.lineItems.nodes.filter((li) => li.currentQuantity > 0).map((li) => `${li.currentQuantity}× ${li.title}`),
    refunds: refundLines(o.transactions ?? []),
    shipments: o.fulfillments.map((f) => ({
      shippedAt: f.createdAt,
      status: tidy(f.displayStatus),
      carrier: f.trackingInfo[0]?.company ?? null,
      tracking: f.trackingInfo[0]?.number ?? null,
      trackingUrl: f.trackingInfo[0]?.url ?? null,
      deliveredAt: f.deliveredAt,
    })),
  };
}

/** Order numbers written in an email, e.g. "#LW001289", "LW1289", "order 1289" → ["LW001289", ...]. */
export function orderNumbersIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/#?\b(LW\d{3,9})\b/gi)) found.add(m[1].toUpperCase());
  return [...found].slice(0, 5);
}

/**
 * The customer's orders: those placed with the sender's email address, newest
 * first, at most five. An order number the sender mentions is only looked up
 * together with their email, so nobody can read another customer's order by
 * quoting its number; numbers that don't match come back as `unmatched`.
 * Never throws: without Shopify the AI simply asks for the order details.
 */
export async function findOrders(storeId: string, email: string, text: string): Promise<{ orders: SupportOrder[]; unmatched: string[] }> {
  const cfg = await getStoreConfig(storeId);
  if (!cfg.shopify) return { orders: [], unmatched: orderNumbersIn(text) };
  const who = `email:'${email.replace(/['\\]/g, "")}'`;
  const mentioned = orderNumbersIn(text);
  const byName = new Map<string, SupportOrder>();
  const run = async (q: string) => {
    try {
      const data = await shopifyGraphQL<{ orders: { nodes: Node[] } }>(
        cfg.shopify!,
        `query($q: String!) { orders(first: 5, query: $q, sortKey: CREATED_AT, reverse: true) { nodes { ${ORDER_FIELDS} } } }`,
        { q },
      );
      for (const o of data.orders.nodes) byName.set(o.name, toSupportOrder(o));
    } catch (err) {
      console.error("support order lookup failed", err instanceof Error ? err.message : err);
    }
  };
  await run(who);
  for (const n of mentioned) if (![...byName.keys()].some((k) => k.replace("#", "").toUpperCase() === n)) await run(`name:${n} AND ${who}`);
  const found = new Set([...byName.keys()].map((k) => k.replace("#", "").toUpperCase()));
  return {
    orders: [...byName.values()].sort((a, b) => b.placedAt.localeCompare(a.placedAt)).slice(0, 5),
    unmatched: mentioned.filter((n) => !found.has(n)),
  };
}

// Stand-in for Shopify: the old key is refused for payouts; a fresh key works; 3 pages of payouts.
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { syncPayouts } from "@/lib/cash/payouts";
import { storeConfig } from "@/lib/integrations/config";

let tokenCalls = 0;
const log: string[] = [];
const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
const page = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({
  id: `gid://shopify/ShopifyPaymentsPayout/T${from + i}`, issuedAt: day((from + i) * 2), status: "PAID", transactionType: "DEPOSIT",
  net: { amount: String(100 + from + i), currencyCode: "USD" },
  summary: Object.fromEntries(["chargesGross", "chargesFee", "refundsFeeGross", "refundsFee", "adjustmentsGross", "adjustmentsFee", "reservedFundsFee", "retriedPayoutsFee", "advanceFees"].map((k) => [k, { amount: "1", currencyCode: "USD" }])),
}));
globalThis.fetch = (async (url: string, init: RequestInit) => {
  const u = String(url);
  if (u.endsWith("/admin/oauth/access_token")) { tokenCalls++; return new Response(JSON.stringify({ access_token: "fresh-token", expires_in: 86399 })); }
  const token = (init.headers as Record<string, string>)["X-Shopify-Access-Token"];
  const { variables } = JSON.parse(String(init.body));
  log.push(`token=${token} page=${variables.after ?? 0}`);
  if (token !== "fresh-token") return new Response(JSON.stringify({ errors: [{ message: "Access denied for shopifyPaymentsAccount field. Required access: read_shopify_payments_accounts" }] }));
  const n = variables.after ? Number(variables.after) : 0;
  return new Response(JSON.stringify({ data: { shopifyPaymentsAccount: { balance: [{ amount: "321.09", currencyCode: "USD" }], payouts: { pageInfo: { hasNextPage: n < 2, endCursor: String(n + 1) }, nodes: page(n * 50, 50) } } } }));
}) as typeof fetch;

(async () => {
  const store = await db.store.findFirstOrThrow({ where: { sortOrder: 0 } });
  const before = { shopifyDomain: store.shopifyDomain, shopifyClientId: store.shopifyClientId, shopifyClientSecret: store.shopifyClientSecret, shopifyToken: store.shopifyToken, shopifyTokenExpires: store.shopifyTokenExpires, shopifyPayoutsNote: store.shopifyPayoutsNote, shopifyBalance: store.shopifyBalance };
  await db.shopifyPayout.deleteMany({ where: { id: { startsWith: "gid://shopify/ShopifyPaymentsPayout/T" } } });
  // An old key cached for 24 hours, made before the permissions were added.
  const s = await db.store.update({ where: { id: store.id }, data: { shopifyDomain: "learnwell-test.myshopify.com", shopifyClientId: "cid", shopifyClientSecret: encrypt("secret"), shopifyToken: encrypt("old-token"), shopifyTokenExpires: new Date(Date.now() + 20 * 3600e3) } });
  const cfg = storeConfig(s);
  const n1 = await syncPayouts(cfg);
  const after1 = await db.store.findUniqueOrThrow({ where: { id: store.id } });
  console.log("run 1: payouts saved", n1, "| fresh key fetched", tokenCalls, "time(s) | note:", after1.shopifyPayoutsNote, "| balance", after1.shopifyBalance);
  console.log("  requests:", log.join(" ; "));
  log.length = 0;
  const n2 = await syncPayouts(cfg);
  console.log("run 2 (history already stored): payouts saved", n2, "| requests:", log.join(" ; "));
  console.log("stored test payouts:", await db.shopifyPayout.count({ where: { id: { startsWith: "gid://shopify/ShopifyPaymentsPayout/T" } } }));
  await db.shopifyPayout.deleteMany({ where: { id: { startsWith: "gid://shopify/ShopifyPaymentsPayout/T" } } });
  await db.store.update({ where: { id: store.id }, data: before });
  await db.$disconnect();
})();

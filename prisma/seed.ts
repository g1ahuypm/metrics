/**
 * Seeds the owner account and (optionally) 90 days of realistic demo data so the
 * dashboard is usable before any integration is connected.
 *
 *   npm run db:seed
 *
 * Env: SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD, SEED_OWNER_NAME, SEED_DEMO_DATA=false
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { costOrder, type CostBook, type Tier } from "../src/lib/costing";

const db = new PrismaClient();

// Deterministic PRNG so demo data is stable between runs.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const between = (a: number, b: number) => a + rand() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;

// Supplier costs per bundle: [quantity, product cost total, shipping total]
const PRODUCTS = [
  { product: "Everyday Hoodie", variants: ["Black / M", "Black / L", "Sand / M", "Sand / L"], price: 68, weight: 5, tiers: [[1, 16.4, 4.6], [2, 32.8, 6.2], [3, 49.2, 7.5]] },
  { product: "Trail Cap", variants: ["One size"], price: 32, weight: 4, tiers: [[1, 4.9, 2.6], [2, 9.8, 3.4]] },
  { product: "Merino Crew Socks (3-pack)", variants: ["Mixed"], price: 42, weight: 4, tiers: [[1, 9.8, 3.2], [2, 19.6, 4.1]] },
  { product: "Insulated Bottle 750ml", variants: ["Steel", "Forest"], price: 45, weight: 3, tiers: [[1, 8.7, 3.8], [2, 17.4, 5.3]] },
  { product: "Weekender Bag", variants: ["Olive", "Charcoal"], price: 149, weight: 1.5, tiers: [[1, 41.5, 10.5], [2, 83, 14]] },
  { product: "Wool Beanie", variants: ["Oat", "Navy"], price: 29, weight: 2.5, tiers: [[1, 4.3, 2.5], [2, 8.6, 3.1], [3, 12.9, 3.6]] },
];

const CAMPAIGNS = [
  { name: "[PROSPECTING] Broad – Hoodie UGC", objective: "OUTCOME_SALES", status: "ACTIVE", budget: 250, base: 240, roas: 2.6 },
  { name: "[PROSPECTING] Interests – Outdoor", objective: "OUTCOME_SALES", status: "ACTIVE", budget: 120, base: 110, roas: 1.9 },
  { name: "[RETARGETING] Site visitors 30d", objective: "OUTCOME_SALES", status: "ACTIVE", budget: 60, base: 55, roas: 5.4 },
  { name: "[RETARGETING] Cart abandoners", objective: "OUTCOME_SALES", status: "ACTIVE", budget: 40, base: 38, roas: 7.1 },
  { name: "[TEST] Weekender launch – Static", objective: "OUTCOME_SALES", status: "PAUSED", budget: 80, base: 70, roas: 1.2, activeUntil: 30 },
];

async function seedOwner() {
  const email = (process.env.SEED_OWNER_EMAIL ?? "owner@example.com").toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD ?? "password123";
  const name = process.env.SEED_OWNER_NAME ?? "Store Owner";
  const existing = await db.user.findUnique({ where: { email } });
  if (!existing) {
    await db.user.create({ data: { email, name, passwordHash: await bcrypt.hash(password, 10), role: "OWNER" } });
    console.log(`Created owner ${email} (password: ${password})`);
  } else {
    console.log(`Owner ${email} already exists`);
  }
  await db.settings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", storeName: "Northwind Outfitters", currency: "USD", timezone: "America/New_York", defaultShippingCost: 6.5, defaultHandlingCost: 1.25 },
  });
}

async function seedDemoData() {
  if ((await db.order.count()) > 0) {
    console.log("Orders already exist, skipping demo data");
    return;
  }
  console.log("Seeding demo data…");

  // Partners
  for (const p of [
    { email: "partner@example.com", name: "Alex Partner", role: "PARTNER" },
    { email: "mediabuyer@example.com", name: "Sam Buyer", role: "ADMIN" },
  ]) {
    await db.user.upsert({
      where: { email: p.email },
      update: {},
      create: { ...p, passwordHash: await bcrypt.hash("password123", 10) },
    });
  }

  // Variants + supplier cost tiers
  const book: CostBook = { tiers: new Map(), shopifyUnitCost: new Map(), productOf: new Map(), internalId: new Map(), fallbackCogsPercent: 0 };
  const variants: { id: string; shopifyId: string; title: string; sku: string; price: number; weight: number }[] = [];
  for (const p of PRODUCTS) {
    const productId = `gid://shopify/Product/${100 + PRODUCTS.indexOf(p)}`;
    const tiers: Tier[] = p.tiers.map(([quantity, productCost, shippingCost]) => ({ quantity, productCost, shippingCost }));
    for (const t of tiers) await db.costTier.create({ data: { productId, variantId: "", ...t } });
    book.tiers.set(productId, new Map([["", tiers]]));
    for (const vt of p.variants) {
      const sku = `${p.product.split(" ").map((w) => w[0]).join("").toUpperCase()}-${vt.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6)}`;
      const shopifyId = `gid://shopify/ProductVariant/${1000 + variants.length}`;
      const v = await db.productVariant.create({
        data: { shopifyId, productId, productTitle: p.product, variantTitle: vt, sku, price: p.price, unitCost: tiers[0].productCost, costSource: "shopify" },
      });
      book.shopifyUnitCost.set(shopifyId, tiers[0].productCost);
      book.productOf.set(shopifyId, productId);
      book.internalId.set(shopifyId, v.id);
      variants.push({ id: v.id, shopifyId, title: vt === "One size" || vt === "Mixed" ? p.product : `${p.product} - ${vt}`, sku, price: p.price, weight: p.weight });
    }
  }
  const totalWeight = variants.reduce((s, v) => s + v.weight, 0);
  const weightedVariant = () => {
    let r = rand() * totalWeight;
    for (const v of variants) {
      r -= v.weight;
      if (r <= 0) return v;
    }
    return variants[0];
  };

  // Campaigns
  const campaigns: ((typeof CAMPAIGNS)[number] & { id: string })[] = [];
  for (const c of CAMPAIGNS) {
    const row = await db.campaign.create({
      data: { metaId: `1200${campaigns.length}0000000${int(100, 999)}`, name: c.name, status: c.status, objective: c.objective, dailyBudget: c.budget },
    });
    campaigns.push({ ...c, id: row.id });
  }

  const DAYS = 90;
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (DAYS - 1)));
  const customers: string[] = [];
  let orderNo = 1840;

  for (let d = 0; d < DAYS; d++) {
    const day = new Date(start.getTime() + d * 86400000);
    const dow = day.getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const trend = 1 + (d / DAYS) * 0.35; // growing store
    const promo = d >= DAYS - 12 && d <= DAYS - 9 ? 1.7 : 1; // a promo weekend

    // ---- Ads for the day
    let daySpend = 0;
    let dayAdPurchases = 0;
    for (const c of campaigns) {
      if (c.activeUntil !== undefined && d > c.activeUntil) continue;
      const spend = round2(c.base * between(0.8, 1.2) * (weekend ? 1.1 : 1) * (promo > 1 ? 1.3 : 1));
      const cpm = between(9, 16);
      const impressions = Math.round((spend / cpm) * 1000);
      const ctr = between(0.011, 0.024);
      const clicks = Math.round(impressions * ctr);
      const purchaseValue = round2(spend * c.roas * between(0.7, 1.3) * promo);
      const purchases = Math.max(0, Math.round(purchaseValue / between(60, 85)));
      const addToCart = Math.round(purchases * between(3, 5));
      const initiateCheckout = Math.round(purchases * between(1.5, 2.5));
      daySpend += spend;
      dayAdPurchases += purchases;
      await db.adInsight.create({
        data: {
          date: day,
          campaignId: c.id,
          spend,
          impressions,
          reach: Math.round(impressions * between(0.6, 0.8)),
          clicks,
          purchases,
          purchaseValue,
          addToCart,
          initiateCheckout,
        },
      });
    }

    // ---- Orders for the day (loosely tied to ad spend)
    const baseOrders = 9 + daySpend / 40;
    const orderCount = Math.round(baseOrders * trend * promo * (weekend ? 1.15 : 1) * between(0.75, 1.25));

    for (let i = 0; i < orderCount; i++) {
      const at = new Date(day.getTime() + int(0, 86399) * 1000);
      const returning = customers.length > 20 && rand() < 0.28;
      const customerId = returning ? pick(customers) : `gid://shopify/Customer/${5000 + customers.length}`;
      if (!returning) customers.push(customerId);

      const lineCount = rand() < 0.65 ? 1 : rand() < 0.75 ? 2 : 3;
      const lines: { variantId: string; shopifyId: string; title: string; sku: string; quantity: number; price: number; listPrice: number }[] = [];
      for (let l = 0; l < lineCount; l++) {
        const v = weightedVariant();
        const qty = rand() < 0.8 ? 1 : rand() < 0.8 ? 2 : 3;
        const discount = promo > 1 ? 0.8 : rand() < 0.15 ? 0.9 : 1;
        lines.push({ variantId: v.id, shopifyId: v.shopifyId, title: v.title, sku: v.sku, quantity: qty, price: round2(v.price * qty * discount), listPrice: round2(v.price * qty) });
      }
      const costed = costOrder(book, lines.map((l) => ({ variantShopifyId: l.shopifyId, quantity: l.quantity, price: l.price })), 6.5);
      const subtotal = round2(lines.reduce((s, l) => s + l.price, 0));
      const listTotal = lines.reduce((s, l) => s + l.quantity, 0);
      const shippingCharged = subtotal >= 75 ? 0 : 6.95;
      const tax = round2(subtotal * 0.07);
      const total = round2(subtotal + shippingCharged + tax);
      const refunded = rand() < 0.04 ? round2(pick(lines).price) : 0;
      const cogs = costed.cogs;
      const transactionFees = round2(total * 0.029 + 0.3);
      const cancelled = rand() < 0.01;

      await db.order.create({
        data: {
          shopifyId: `gid://shopify/Order/${9000000 + orderNo}`,
          name: `#${orderNo++}`,
          createdAt: at,
          processedAt: at,
          cancelledAt: cancelled ? at : null,
          financialStatus: cancelled ? "VOIDED" : refunded > 0 ? "PARTIALLY_REFUNDED" : "PAID",
          fulfillmentStatus: d >= DAYS - 2 ? "UNFULFILLED" : "FULFILLED",
          currency: "USD",
          subtotal,
          shippingCharged,
          tax,
          discounts: round2(lines.reduce((s, l) => s + l.listPrice - l.price, 0)),
          total,
          refunded,
          cogs,
          shippingCost: costed.shippingCost,
          handlingCost: round2(1.25 + (listTotal - 1) * 0.35),
          transactionFees,
          platformFees: 0,
          customerId,
          customerEmail: `customer${customerId.split("/").pop()}@example.com`,
          isNewCustomer: !returning,
          itemCount: listTotal,
          source: rand() < 0.9 ? "web" : "shopify_draft_order",
          lineItems: {
            create: lines.map(({ listPrice: _listPrice, shopifyId: _sid, ...l }, i) => ({
              ...l,
              unitCost: costed.lines[i].unitCost,
              shippingCost: costed.lines[i].shippingCost,
              costSource: costed.lines[i].source,
            })),
          },
        },
      });
    }
  }

  // Custom costs
  const monthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  await db.customCost.createMany({
    data: [
      { name: "Shopify plan", category: "Software & apps", type: "MONTHLY", amount: 105, startDate: monthStart },
      { name: "Klaviyo", category: "Software & apps", type: "MONTHLY", amount: 150, startDate: monthStart },
      { name: "Customer support VA", category: "Team & contractors", type: "MONTHLY", amount: 900, startDate: monthStart },
      { name: "UGC creators", category: "Content & creative", type: "MONTHLY", amount: 600, startDate: monthStart },
      { name: "Packaging inserts", category: "Shipping & fulfillment", type: "PER_ORDER", amount: 0.45, startDate: monthStart },
      { name: "Weekender launch photoshoot", category: "Content & creative", type: "ONE_TIME", amount: 1200, startDate: new Date(start.getTime() + 20 * 86400000) },
    ],
  });

  console.log(`Seeded ${orderNo - 1840} orders, ${campaigns.length} campaigns, ${variants.length} variants over ${DAYS} days`);
}

async function main() {
  await seedOwner();
  if (process.env.SEED_DEMO_DATA !== "false") await seedDemoData();
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

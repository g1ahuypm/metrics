import "server-only";
import { db } from "./db";
import { daysInUtcMonth, eachDay, endOfUtcDay, toISODate, utcDay, type DateRange } from "./dates";
import { safeDiv } from "./format";

/** Round to cents so sums of many floating-point values never show drift. */
export const cents = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Profit & loss model
//
//   Gross sales                 line items at list price
// − Discounts
// − Refunds
// = Net sales
// + Shipping charged            what customers paid for shipping
// + Taxes collected
// = Revenue                     matches Shopify "Total sales"
// − Taxes collected             pass-through to the tax authority
// − Cost of goods sold
// − Shipping cost               labels / carrier
// − Handling cost               pick, pack, packaging
// − Payment processing fees     Shopify Payments / gateway
// − Platform fees               Shopify surcharge for third-party gateways
// = Gross profit
// − Ad spend                    Meta
// − Other costs                 custom costs (apps, team, agencies, ...)
// = Net profit
// ---------------------------------------------------------------------------

export type MoneyLines = {
  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;
  shippingCharged: number;
  tax: number;
  revenue: number;
  cogs: number;
  shippingCost: number;
  handlingCost: number;
  paymentFees: number;
  platformFees: number;
  totalFees: number;
  fulfillmentCost: number; // shipping + handling
  grossProfit: number;
  adSpend: number;
  customCosts: number;
  totalCosts: number; // everything deducted from revenue
  netProfit: number;
};

export type CountLines = {
  orders: number;
  units: number;
  newCustomers: number;
  returningCustomers: number;
  refundedOrders: number;
  adPurchases: number;
  adPurchaseValue: number;
  impressions: number;
  reach: number;
  clicks: number;
  addToCart: number;
  initiateCheckout: number;
};

export type DailyPoint = { date: string; customCostBreakdown: Record<string, number> } & MoneyLines & CountLines;

export type Totals = MoneyLines &
  CountLines & {
    customCostBreakdown: Record<string, number>;
    // Ratios
    grossMargin: number; // gross profit / revenue
    margin: number; // net profit / revenue
    cogsPercent: number;
    discountRate: number; // discounts / gross sales
    refundRate: number; // refunds / gross sales
    aov: number;
    profitPerOrder: number;
    grossProfitPerOrder: number;
    cogsPerOrder: number;
    feesPerOrder: number;
    fulfillmentPerOrder: number;
    unitsPerOrder: number;
    repeatRate: number; // returning customers / orders
    // Marketing
    roas: number; // Meta purchase value / spend
    mer: number; // revenue / spend
    poas: number; // gross profit / spend
    cpa: number; // spend / Meta purchases
    blendedCpa: number; // spend / Shopify orders
    ncpa: number; // spend / new customers
    adSpendPercent: number; // spend / revenue
    ctr: number;
    cpc: number;
    cpm: number;
    cvr: number; // Meta purchases / clicks
    breakEvenRoas: number; // revenue / gross profit: the ROAS needed to break even
  };

const MONEY_KEYS: (keyof MoneyLines)[] = [
  "grossSales", "discounts", "refunds", "netSales", "shippingCharged", "tax", "revenue", "cogs", "shippingCost",
  "handlingCost", "paymentFees", "platformFees", "totalFees", "fulfillmentCost", "grossProfit", "adSpend",
  "customCosts", "totalCosts", "netProfit",
];
const COUNT_KEYS: (keyof CountLines)[] = [
  "orders", "units", "newCustomers", "returningCustomers", "refundedOrders", "adPurchases", "adPurchaseValue",
  "impressions", "reach", "clicks", "addToCart", "initiateCheckout",
];

function emptyDay(date: string): DailyPoint {
  const d = { date, customCostBreakdown: {} } as DailyPoint;
  for (const k of MONEY_KEYS) d[k] = 0;
  for (const k of COUNT_KEYS) d[k] = 0;
  return d;
}

/** Fills in every subtotal from the raw inputs. */
function finalize(d: MoneyLines): void {
  d.netSales = d.grossSales - d.discounts - d.refunds;
  d.revenue = d.netSales + d.shippingCharged + d.tax;
  d.totalFees = d.paymentFees + d.platformFees;
  d.fulfillmentCost = d.shippingCost + d.handlingCost;
  d.grossProfit = d.revenue - d.tax - d.cogs - d.fulfillmentCost - d.totalFees;
  d.netProfit = d.grossProfit - d.adSpend - d.customCosts;
  d.totalCosts = d.revenue - d.netProfit;
}

async function loadDaily(from: Date, to: Date): Promise<DailyPoint[]> {
  const days = eachDay(from, to);
  const map = new Map<string, DailyPoint>(days.map((d) => [d, emptyDay(d)]));
  const toEnd = endOfUtcDay(to);

  const [orders, insights, customCosts] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: from, lte: toEnd }, cancelledAt: null },
      select: {
        createdAt: true,
        subtotal: true,
        discounts: true,
        shippingCharged: true,
        tax: true,
        refunded: true,
        cogs: true,
        shippingCost: true,
        handlingCost: true,
        transactionFees: true,
        platformFees: true,
        itemCount: true,
        isNewCustomer: true,
      },
    }),
    db.adInsight.findMany({
      where: { date: { gte: from, lte: toEnd } },
      select: {
        date: true, spend: true, impressions: true, reach: true, clicks: true, purchases: true, purchaseValue: true,
        addToCart: true, initiateCheckout: true,
      },
    }),
    db.customCost.findMany({
      where: { startDate: { lte: toEnd }, OR: [{ endDate: null }, { endDate: { gte: from } }] },
    }),
  ]);

  for (const o of orders) {
    const d = map.get(toISODate(utcDay(o.createdAt)));
    if (!d) continue;
    d.grossSales += o.subtotal + o.discounts;
    d.discounts += o.discounts;
    d.refunds += o.refunded;
    d.shippingCharged += o.shippingCharged;
    d.tax += o.tax;
    d.cogs += o.cogs;
    d.shippingCost += o.shippingCost;
    d.handlingCost += o.handlingCost;
    d.paymentFees += o.transactionFees;
    d.platformFees += o.platformFees;
    d.orders += 1;
    d.units += o.itemCount;
    if (o.refunded > 0) d.refundedOrders += 1;
    if (o.isNewCustomer) d.newCustomers += 1;
    else d.returningCustomers += 1;
  }

  for (const i of insights) {
    const d = map.get(toISODate(utcDay(i.date)));
    if (!d) continue;
    d.adSpend += i.spend;
    d.impressions += i.impressions;
    d.reach += i.reach;
    d.clicks += i.clicks;
    d.adPurchases += i.purchases;
    d.adPurchaseValue += i.purchaseValue;
    d.addToCart += i.addToCart;
    d.initiateCheckout += i.initiateCheckout;
  }

  // Custom costs, allocated per day. Percent-of-revenue costs need the day's
  // revenue, so compute revenue first.
  for (const d of map.values()) d.revenue = d.grossSales - d.discounts - d.refunds + d.shippingCharged + d.tax;

  for (const c of customCosts) {
    const start = utcDay(c.startDate);
    const end = c.endDate ? utcDay(c.endDate) : null;
    for (const d of map.values()) {
      const day = new Date(`${d.date}T00:00:00.000Z`);
      if (day < start || (end && day > end)) continue;
      let amount = 0;
      switch (c.type) {
        case "MONTHLY": amount = c.amount / daysInUtcMonth(day); break;
        case "DAILY": amount = c.amount; break;
        case "ONE_TIME": amount = day.getTime() === start.getTime() ? c.amount : 0; break;
        case "PERCENT_REVENUE": amount = (d.revenue * c.amount) / 100; break;
        case "PER_ORDER": amount = d.orders * c.amount; break;
      }
      if (amount === 0) continue;
      d.customCosts += amount;
      d.customCostBreakdown[c.category] = (d.customCostBreakdown[c.category] ?? 0) + amount;
    }
  }

  for (const d of map.values()) finalize(d);
  return days.map((k) => map.get(k)!);
}

export function summarize(daily: DailyPoint[]): Totals {
  const t = { customCostBreakdown: {} as Record<string, number> } as Totals;
  for (const k of MONEY_KEYS) t[k] = 0;
  for (const k of COUNT_KEYS) t[k] = 0;
  for (const d of daily) {
    for (const k of MONEY_KEYS) t[k] += d[k];
    for (const k of COUNT_KEYS) t[k] += d[k];
    for (const [cat, v] of Object.entries(d.customCostBreakdown)) {
      t.customCostBreakdown[cat] = (t.customCostBreakdown[cat] ?? 0) + v;
    }
  }
  finalize(t);
  for (const k of MONEY_KEYS) t[k] = cents(t[k]);
  for (const cat of Object.keys(t.customCostBreakdown)) t.customCostBreakdown[cat] = cents(t.customCostBreakdown[cat]);

  t.grossMargin = safeDiv(t.grossProfit, t.revenue);
  t.margin = safeDiv(t.netProfit, t.revenue);
  t.cogsPercent = safeDiv(t.cogs, t.revenue);
  t.discountRate = safeDiv(t.discounts, t.grossSales);
  t.refundRate = safeDiv(t.refunds, t.grossSales);
  t.aov = safeDiv(t.revenue, t.orders);
  t.profitPerOrder = safeDiv(t.netProfit, t.orders);
  t.grossProfitPerOrder = safeDiv(t.grossProfit, t.orders);
  t.cogsPerOrder = safeDiv(t.cogs, t.orders);
  t.feesPerOrder = safeDiv(t.totalFees, t.orders);
  t.fulfillmentPerOrder = safeDiv(t.fulfillmentCost, t.orders);
  t.unitsPerOrder = safeDiv(t.units, t.orders);
  t.repeatRate = safeDiv(t.returningCustomers, t.orders);
  t.roas = safeDiv(t.adPurchaseValue, t.adSpend);
  t.mer = safeDiv(t.revenue, t.adSpend);
  t.poas = safeDiv(t.grossProfit, t.adSpend);
  t.cpa = safeDiv(t.adSpend, t.adPurchases);
  t.blendedCpa = safeDiv(t.adSpend, t.orders);
  t.ncpa = safeDiv(t.adSpend, t.newCustomers);
  t.adSpendPercent = safeDiv(t.adSpend, t.revenue);
  t.ctr = safeDiv(t.clicks, t.impressions);
  t.cpc = safeDiv(t.adSpend, t.clicks);
  t.cpm = safeDiv(t.adSpend, t.impressions) * 1000;
  t.cvr = safeDiv(t.adPurchases, t.clicks);
  t.breakEvenRoas = safeDiv(t.revenue, t.grossProfit);
  return t;
}

export type MetricsReport = {
  range: DateRange;
  daily: DailyPoint[];
  totals: Totals;
  previous: Totals;
};

export async function getMetrics(range: DateRange): Promise<MetricsReport> {
  const [daily, prevDaily] = await Promise.all([
    loadDaily(range.from, range.to),
    loadDaily(range.prevFrom, range.prevTo),
  ]);
  return { range, daily, totals: summarize(daily), previous: summarize(prevDaily) };
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

export type CampaignRow = {
  id: string;
  metaId: string;
  name: string;
  status: string;
  objective: string | null;
  dailyBudget: number | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchases: number;
  purchaseValue: number;
  addToCart: number;
  initiateCheckout: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cvr: number;
  frequency: number;
};

export async function getCampaignBreakdown(range: DateRange): Promise<CampaignRow[]> {
  const rows = await db.adInsight.findMany({
    where: { date: { gte: range.from, lte: endOfUtcDay(range.to) } },
    include: { campaign: true },
  });
  const map = new Map<string, CampaignRow>();
  for (const r of rows) {
    let c = map.get(r.campaignId);
    if (!c) {
      c = {
        id: r.campaign.id, metaId: r.campaign.metaId, name: r.campaign.name, status: r.campaign.status,
        objective: r.campaign.objective, dailyBudget: r.campaign.dailyBudget,
        spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, purchaseValue: 0, addToCart: 0, initiateCheckout: 0,
        roas: 0, cpa: 0, ctr: 0, cpc: 0, cpm: 0, cvr: 0, frequency: 0,
      };
      map.set(r.campaignId, c);
    }
    c.spend += r.spend;
    c.impressions += r.impressions;
    c.reach += r.reach;
    c.clicks += r.clicks;
    c.purchases += r.purchases;
    c.purchaseValue += r.purchaseValue;
    c.addToCart += r.addToCart;
    c.initiateCheckout += r.initiateCheckout;
  }
  const out = [...map.values()].map((c) => ({
    ...c,
    spend: cents(c.spend),
    purchaseValue: cents(c.purchaseValue),
    roas: safeDiv(c.purchaseValue, c.spend),
    cpa: safeDiv(c.spend, c.purchases),
    ctr: safeDiv(c.clicks, c.impressions),
    cpc: safeDiv(c.spend, c.clicks),
    cpm: safeDiv(c.spend, c.impressions) * 1000,
    cvr: safeDiv(c.purchases, c.clicks),
    frequency: safeDiv(c.impressions, c.reach),
  }));
  out.sort((a, b) => b.spend - a.spend);
  return out;
}

export type ProductRow = {
  variantId: string | null;
  title: string;
  sku: string | null;
  units: number;
  orders: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  margin: number;
  unitCost: number | null;
};

export async function getProductBreakdown(range: DateRange): Promise<ProductRow[]> {
  const items = await db.orderLineItem.findMany({
    where: { order: { createdAt: { gte: range.from, lte: endOfUtcDay(range.to) }, cancelledAt: null } },
    include: { variant: { select: { productTitle: true, variantTitle: true, unitCost: true } } },
  });
  const map = new Map<string, ProductRow & { orderIds: Set<string> }>();
  for (const li of items) {
    const key = li.variantId ?? `title:${li.title}`;
    let row = map.get(key);
    if (!row) {
      const title = li.variant
        ? li.variant.variantTitle && li.variant.variantTitle !== "Default Title"
          ? `${li.variant.productTitle} – ${li.variant.variantTitle}`
          : li.variant.productTitle
        : li.title;
      row = {
        variantId: li.variantId, title, sku: li.sku, units: 0, orders: 0, revenue: 0, cogs: 0, grossProfit: 0, margin: 0,
        unitCost: li.variant?.unitCost ?? null, orderIds: new Set(),
      };
      map.set(key, row);
    }
    row.units += li.quantity;
    row.revenue += li.price;
    row.cogs += li.unitCost * li.quantity;
    row.orderIds.add(li.orderId);
  }
  const out = [...map.values()].map(({ orderIds, ...r }) => {
    const revenue = cents(r.revenue);
    const cogs = cents(r.cogs);
    const grossProfit = cents(revenue - cogs);
    return { ...r, revenue, cogs, orders: orderIds.size, grossProfit, margin: safeDiv(grossProfit, revenue) };
  });
  out.sort((a, b) => b.revenue - a.revenue);
  return out;
}

export async function getRecentOrders(range: DateRange, limit = 50) {
  return db.order.findMany({
    where: { createdAt: { gte: range.from, lte: endOfUtcDay(range.to) } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { lineItems: { select: { title: true, quantity: true } } },
  });
}

export async function getDataStatus() {
  const [settings, orderCount, insightCount, lastSyncs] = await Promise.all([
    db.settings.findUnique({ where: { id: "default" } }),
    db.order.count(),
    db.adInsight.count(),
    db.syncLog.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
  ]);
  return {
    settings,
    orderCount,
    insightCount,
    lastSyncs,
    shopifyConnected: Boolean(settings?.shopifyDomain && settings?.shopifyToken),
    metaConnected: Boolean(settings?.metaAdAccountId && settings?.metaToken),
  };
}

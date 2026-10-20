import "server-only";
import { db } from "./db";
import { addDays, subDays } from "date-fns";
import type { Prisma } from "@prisma/client";
import { dayEnd, dayStart, daysInUtcMonth, eachDay, endOfUtcDay, storeDate, toISODate, utcDay, type DateRange } from "./dates";
import { validTimezone } from "./scope";
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

/** One order's contribution to the daily figures, already narrowed to a product when one is selected. */
type OrderSlice = {
  orderId: string;
  name: string;
  country: string | null;
  cancelled: boolean;
  /** What the customer paid for the product's lines (exact, after all discounts); whole subtotal in store view. */
  paid: number;
  createdAt: Date;
  grossSales: number;
  discounts: number;
  refunds: number;
  shippingCharged: number;
  tax: number;
  cogs: number;
  shippingCost: number;
  handlingCost: number;
  paymentFees: number;
  platformFees: number;
  units: number;
  isNewCustomer: boolean;
};

const orderSelect = {
  id: true,
  name: true,
  country: true,
  cancelledAt: true,
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
} as const;

/**
 * Orders placed in [start, end). Cancelled orders are included like Shopify's
 * reports do: the sync stores what the customer was charged minus refunds and no
 * product or shipping cost, so one cancelled and refunded nets to zero.
 */
async function loadOrderSlices(start: Date, end: Date, storeId: string, productId?: string): Promise<OrderSlice[]> {
  if (!productId) {
    const orders = await db.order.findMany({ where: { storeId, createdAt: { gte: start, lt: end } }, select: orderSelect });
    return orders.map((o) => ({
      orderId: o.id,
      name: o.name,
      country: o.country,
      cancelled: o.cancelledAt !== null,
      paid: o.subtotal,
      createdAt: o.createdAt,
      grossSales: o.subtotal + o.discounts,
      discounts: o.discounts,
      refunds: o.refunded,
      shippingCharged: o.shippingCharged,
      tax: o.tax,
      cogs: o.cogs,
      shippingCost: o.shippingCost,
      handlingCost: o.handlingCost,
      paymentFees: o.transactionFees,
      platformFees: o.platformFees,
      units: o.itemCount,
      isNewCustomer: o.isNewCustomer,
    }));
  }

  // Product view: orders containing the product. Line-level amounts (price, product
  // cost, tier shipping) are exact; order-level amounts (tax, shipping charged,
  // fees, refunds, discounts, handling) are split by the product's share of the order.
  const orders = await db.order.findMany({
    where: { storeId, createdAt: { gte: start, lt: end }, lineItems: { some: { variant: { productId } } } },
    select: {
      ...orderSelect,
      lineItems: { select: { price: true, listPrice: true, quantity: true, unitCost: true, shippingCost: true, costSource: true, variant: { select: { productId: true } } } },
    },
  });
  return orders.map((o) => {
    const mine = o.lineItems.filter((li) => li.variant?.productId === productId);
    const minePrice = mine.reduce((s, li) => s + li.price, 0);
    // Free gifts ($0 lines of other products) belong to whatever was paid for in the order.
    const gifts = o.lineItems.filter((li) => li.variant?.productId !== productId && li.price === 0);
    const share = o.subtotal > 0 ? minePrice / o.subtotal : o.lineItems.length ? mine.length / o.lineItems.length : 0;
    const tiered = o.lineItems.some((li) => li.costSource === "tier");
    const giftCogs = gifts.reduce((s, li) => s + li.unitCost * li.quantity, 0) * share;
    const giftShipping = gifts.reduce((s, li) => s + li.shippingCost, 0) * share;
    return {
      orderId: o.id,
      name: o.name,
      country: o.country,
      cancelled: o.cancelledAt !== null,
      paid: minePrice,
      createdAt: o.createdAt,
      grossSales: mine.reduce((s, li) => s + li.listPrice, 0),
      discounts: mine.reduce((s, li) => s + (li.listPrice - li.price), 0),
      refunds: o.refunded * share,
      shippingCharged: o.shippingCharged * share,
      tax: o.tax * share,
      cogs: mine.reduce((s, li) => s + li.unitCost * li.quantity, 0) + giftCogs,
      shippingCost: (tiered ? mine.reduce((s, li) => s + li.shippingCost, 0) : o.shippingCost * share) + giftShipping,
      handlingCost: o.handlingCost * share,
      paymentFees: o.transactionFees * share,
      platformFees: o.platformFees * share,
      units: mine.reduce((s, li) => s + li.quantity, 0),
      isNewCustomer: o.isNewCustomer,
    };
  });
}

/** A store's revenue (charged − refunded) per calendar day in its own time zone, for sharing out expenses. */
type StoreRevenue = { byStore: Map<string, Map<string, number>>; storeCount: number };

async function storeRevenueByDay(from: Date, to: Date): Promise<StoreRevenue> {
  const stores = await db.store.findMany({ select: { id: true, timezone: true } });
  const tzOf = new Map(stores.map((s) => [s.id, validTimezone(s.timezone)]));
  // A day either side covers every time zone.
  const rows = await db.order.findMany({
    where: { createdAt: { gte: subDays(from, 1), lt: addDays(endOfUtcDay(to), 1) } },
    select: { storeId: true, createdAt: true, total: true, refunded: true },
  });
  const byStore = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!r.storeId) continue;
    const m = byStore.get(r.storeId) ?? new Map<string, number>();
    const k = storeDate(r.createdAt, tzOf.get(r.storeId) ?? "UTC");
    m.set(k, (m.get(k) ?? 0) + r.total - r.refunded);
    byStore.set(r.storeId, m);
  }
  return { byStore, storeCount: stores.length };
}

type StoreRef = { id: string; timezone: string };

/**
 * One store's figures per calendar day in its own time zone (or one product's, when given).
 * Expenses: the store's own, plus its share of shared ones (split by the stores' revenue that day).
 */
async function loadDaily(from: Date, to: Date, store: StoreRef, productId: string | undefined, revenue: StoreRevenue | null): Promise<DailyPoint[]> {
  const tz = validTimezone(store.timezone);
  const days = eachDay(from, to);
  const map = new Map<string, DailyPoint>(days.map((d) => [d, emptyDay(d)]));
  const toEnd = endOfUtcDay(to);
  // Orders are bucketed by the store's calendar day; ad insights and expenses are already calendar dates.
  const start = dayStart(from, tz);
  const end = dayEnd(to, tz);

  const [orders, insights, customCosts] = await Promise.all([
    loadOrderSlices(start, end, store.id, productId),
    db.adInsight.findMany({
      where: { date: { gte: from, lte: toEnd }, campaign: productId ? { productId } : { storeId: store.id } },
      select: {
        date: true, spend: true, impressions: true, reach: true, clicks: true, purchases: true, purchaseValue: true,
        addToCart: true, initiateCheckout: true,
      },
    }),
    db.customCost.findMany({
      where: {
        AND: [
          { OR: [{ storeId: store.id }, { storeId: null }] },
          { startDate: { lte: toEnd } },
          { OR: [{ endDate: null }, { endDate: { gte: from } }] },
        ],
      },
    }),
  ]);

  for (const o of orders) {
    const d = map.get(storeDate(o.createdAt, tz));
    if (!d) continue;
    d.grossSales += o.grossSales;
    d.discounts += o.discounts;
    d.refunds += o.refunds;
    d.shippingCharged += o.shippingCharged;
    d.tax += o.tax;
    d.cogs += o.cogs;
    d.shippingCost += o.shippingCost;
    d.handlingCost += o.handlingCost;
    d.paymentFees += o.paymentFees;
    d.platformFees += o.platformFees;
    d.orders += 1;
    d.units += o.units;
    if (o.refunds > 0) d.refundedOrders += 1;
    if (o.isNewCustomer) d.newCustomers += 1;
    else d.returningCustomers += 1;
  }

  addInsights(map, insights);

  // Custom costs, allocated per day. Percent-of-revenue costs need the day's
  // revenue, so compute revenue first.
  for (const d of map.values()) d.revenue = d.grossSales - d.discounts - d.refunds + d.shippingCharged + d.tax;

  const storeRev = revenue?.byStore.get(store.id);
  for (const c of customCosts) {
    const start = utcDay(c.startDate);
    const end = c.endDate ? utcDay(c.endDate) : null;
    for (const d of map.values()) {
      const day = new Date(`${d.date}T00:00:00.000Z`);
      if (day < start || (end && day > end)) continue;
      // In product view, fixed expenses are shared out by the product's share of that day's store revenue.
      const productShare = productId ? (() => { const t = storeRev?.get(d.date) ?? 0; return t > 0 ? d.revenue / t : 0; })() : 1;
      // A shared fixed expense is split between the stores by their revenue that day (evenly on a day nobody sold).
      const storeShare = c.storeId === null && revenue && revenue.storeCount > 1
        ? (() => {
            let all = 0;
            for (const m of revenue.byStore.values()) all += m.get(d.date) ?? 0;
            return all > 0 ? (storeRev?.get(d.date) ?? 0) / all : 1 / revenue.storeCount;
          })()
        : 1;
      const share = productShare * storeShare;
      let amount = 0;
      switch (c.type) {
        case "MONTHLY": amount = (c.amount / daysInUtcMonth(day)) * share; break;
        case "DAILY": amount = c.amount * share; break;
        case "ONE_TIME": amount = day.getTime() === start.getTime() ? c.amount * share : 0; break;
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

type InsightRow = {
  date: Date; spend: number; impressions: number; reach: number; clicks: number; purchases: number; purchaseValue: number;
  addToCart: number; initiateCheckout: number;
};

function addInsights(map: Map<string, DailyPoint>, insights: InsightRow[]): void {
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
}

/** Campaigns not linked to any store yet, in ad accounts these stores use. */
const unlinkedCampaigns = (storeIds: string[]): Prisma.CampaignWhereInput => ({
  storeId: null,
  adAccount: { stores: { some: { storeId: { in: storeIds } } } },
});

/** Spend from shared ad accounts that isn't linked to a store yet: counted in "All stores" so nothing goes missing. */
async function loadUnlinkedDaily(from: Date, to: Date, storeIds: string[]): Promise<DailyPoint[]> {
  const days = eachDay(from, to);
  const map = new Map<string, DailyPoint>(days.map((d) => [d, emptyDay(d)]));
  const insights = await db.adInsight.findMany({
    where: { date: { gte: from, lte: endOfUtcDay(to) }, campaign: unlinkedCampaigns(storeIds) },
  });
  addInsights(map, insights);
  for (const d of map.values()) finalize(d);
  return days.map((k) => map.get(k)!);
}

/** Adds several stores' days together (same calendar date = same row). */
function mergeDaily(lists: DailyPoint[][], days: string[]): DailyPoint[] {
  const out = days.map((d) => emptyDay(d));
  for (const list of lists) {
    list.forEach((p, i) => {
      const o = out[i];
      for (const k of MONEY_KEYS) o[k] += p[k];
      for (const k of COUNT_KEYS) o[k] += p[k];
      for (const [cat, v] of Object.entries(p.customCostBreakdown)) o.customCostBreakdown[cat] = (o.customCostBreakdown[cat] ?? 0) + v;
    });
  }
  for (const o of out) finalize(o);
  return out;
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

export type StoreTotals = { id: string; name: string; color: string; totals: Totals };

export type MetricsReport = {
  range: DateRange;
  daily: DailyPoint[];
  totals: Totals;
  previous: Totals;
  /** Each store's own totals, when several stores are combined. */
  byStore: StoreTotals[];
  /** Spend from shared ad accounts not yet linked to a store (included in totals). */
  unlinkedSpend: number;
};

/** The stores a product belongs to (one, unless the same product id exists in two shops). */
async function productStores(productId: string, storeIds?: string[]) {
  const rows = await db.productVariant.findMany({ where: { productId, storeId: storeIds ? { in: storeIds } : { not: null } }, select: { storeId: true }, distinct: ["storeId"] });
  return rows.map((r) => r.storeId!);
}

/**
 * Figures for the stores in scope (one store, or several added up), or for one product.
 * Every store is counted in its own time zone, exactly like its Shopify reports.
 */
export async function getMetrics(range: DateRange, scope: { storeIds: string[] }, productId?: string, opts: { previous?: boolean } = {}): Promise<MetricsReport> {
  const ids = productId ? await productStores(productId, scope.storeIds) : scope.storeIds;
  const [stores, storeCount] = await Promise.all([
    db.store.findMany({ where: { id: { in: ids } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, color: true, timezone: true } }),
    db.store.count(),
  ]);
  const withPrevious = opts.previous !== false;
  const needRevenue = Boolean(productId) || storeCount > 1;
  const [revNow, revPrev] = await Promise.all([
    needRevenue ? storeRevenueByDay(range.from, range.to) : null,
    needRevenue && withPrevious ? storeRevenueByDay(range.prevFrom, range.prevTo) : null,
  ]);
  const combined = !productId && stores.length > 1;
  const [perStore, perStorePrev, unlinked, unlinkedPrev] = await Promise.all([
    Promise.all(stores.map((s) => loadDaily(range.from, range.to, s, productId, revNow))),
    withPrevious ? Promise.all(stores.map((s) => loadDaily(range.prevFrom, range.prevTo, s, productId, revPrev))) : Promise.resolve([] as DailyPoint[][]),
    combined ? loadUnlinkedDaily(range.from, range.to, ids) : Promise.resolve(null),
    combined && withPrevious ? loadUnlinkedDaily(range.prevFrom, range.prevTo, ids) : Promise.resolve(null),
  ]);
  const days = eachDay(range.from, range.to);
  const prevDays = eachDay(range.prevFrom, range.prevTo);
  const daily = perStore.length === 1 && !unlinked ? perStore[0] : mergeDaily([...perStore, ...(unlinked ? [unlinked] : [])], days);
  const prevDaily = !withPrevious ? [] : perStorePrev.length === 1 && !unlinkedPrev ? perStorePrev[0] : mergeDaily([...perStorePrev, ...(unlinkedPrev ? [unlinkedPrev] : [])], prevDays);
  return {
    range,
    daily,
    totals: summarize(daily),
    previous: summarize(prevDaily),
    byStore: combined ? stores.map((s, i) => ({ id: s.id, name: s.name, color: s.color, totals: summarize(perStore[i]) })) : [],
    unlinkedSpend: unlinked ? cents(unlinked.reduce((sum, d) => sum + d.adSpend, 0)) : 0,
  };
}

/** Orders placed in the date range, each store's days in its own time zone. */
async function orderWindows(range: DateRange, storeIds: string[]): Promise<Prisma.OrderWhereInput> {
  const stores = await db.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, timezone: true } });
  if (stores.length === 0) return { id: "none" };
  return {
    OR: stores.map((s) => {
      const tz = validTimezone(s.timezone);
      return { storeId: s.id, createdAt: { gte: dayStart(range.from, tz), lt: dayEnd(range.to, tz) } };
    }),
  };
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
  productId: string | null;
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

/** Campaigns whose spend these stores see: their own, plus not-yet-linked ones in ad accounts they use. */
const campaignsOf = (storeIds: string[]): Prisma.CampaignWhereInput => ({ OR: [{ storeId: { in: storeIds } }, unlinkedCampaigns(storeIds)] });

export async function getCampaignBreakdown(range: DateRange, scope: { storeIds: string[] }, productId?: string): Promise<CampaignRow[]> {
  const rows = await db.adInsight.findMany({
    where: { date: { gte: range.from, lte: endOfUtcDay(range.to) }, campaign: productId ? { productId } : campaignsOf(scope.storeIds) },
    include: { campaign: true },
  });
  const map = new Map<string, CampaignRow>();
  for (const r of rows) {
    let c = map.get(r.campaignId);
    if (!c) {
      c = {
        id: r.campaign.id, metaId: r.campaign.metaId, name: r.campaign.name, status: r.campaign.status,
        objective: r.campaign.objective, dailyBudget: r.campaign.dailyBudget, productId: r.campaign.productId,
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

/** What is connected and synced for the stores in scope. */
export async function getDataStatus(scope: { storeIds: string[] }) {
  const ids = scope.storeIds;
  const [stores, accounts, orderCount, insightCount, lastSyncs] = await Promise.all([
    db.store.findMany({ where: { id: { in: ids } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.adAccount.findMany({ where: { token: { not: null }, stores: { some: { storeId: { in: ids } } } }, select: { id: true } }),
    db.order.count({ where: { storeId: { in: ids } } }),
    db.adInsight.count({ where: { campaign: campaignsOf(ids) } }),
    db.syncLog.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
  ]);
  return {
    stores,
    /** Every store in scope reports in this currency (all stores are USD today). */
    currency: stores[0]?.currency ?? "USD",
    orderCount,
    insightCount,
    lastSyncs,
    shopifyConnected: stores.some((s) => Boolean(s.shopifyDomain && (s.shopifyClientSecret || s.shopifyToken))),
    metaConnected: accounts.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Product selector
// ---------------------------------------------------------------------------

export type ProductOption = { id: string; title: string; units: number; campaigns: number };

/** Products for the picker, most-sold first, with how many campaigns are linked to each. */
export async function getProductOptions(scope: { storeIds: string[] }): Promise<ProductOption[]> {
  const [variants, sold, campaigns] = await Promise.all([
    db.productVariant.findMany({ where: { storeId: { in: scope.storeIds } }, select: { id: true, productId: true, productTitle: true } }),
    db.orderLineItem.groupBy({ by: ["variantId"], _sum: { quantity: true }, where: { variantId: { not: null }, order: { storeId: { in: scope.storeIds } } } }),
    db.campaign.groupBy({ by: ["productId"], _count: { _all: true }, where: { productId: { not: null } } }),
  ]);
  const unitsByVariant = new Map(sold.map((s) => [s.variantId, s._sum.quantity ?? 0]));
  const campaignsByProduct = new Map(campaigns.map((c) => [c.productId, c._count._all]));
  const map = new Map<string, ProductOption>();
  for (const v of variants) {
    if (!v.productId) continue;
    const p = map.get(v.productId) ?? { id: v.productId, title: v.productTitle, units: 0, campaigns: campaignsByProduct.get(v.productId) ?? 0 };
    p.units += unitsByVariant.get(v.id) ?? 0;
    map.set(v.productId, p);
  }
  return [...map.values()].sort((a, b) => b.units - a.units || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------------------
// Product page: bundles, campaigns, product list, orders
// ---------------------------------------------------------------------------

const sliceRevenue = (o: OrderSlice) => o.grossSales - o.discounts - o.refunds + o.shippingCharged + o.tax;
const sliceProfit = (o: OrderSlice) =>
  sliceRevenue(o) - o.tax - o.cogs - o.shippingCost - o.handlingCost - o.paymentFees - o.platformFees;

export type BundleRow = {
  quantity: number; // how many of the product the order holds
  price: number; // exactly what the customer paid for them
  orders: number;
  revenue: number;
  productCost: number; // supplier product cost, including any free gift in the order
  shippingCost: number; // supplier shipping and handling
  fees: number;
  profit: number; // before ad spend
};

/**
 * One row per bundle size and exact price paid (Buy 2 at $84.95 and Buy 2 at
 * $94.95 are separate rows). Cancelled orders are left out: nothing was sold.
 */
export async function getBundleBreakdown(range: DateRange, scope: { storeIds: string[] }, productId: string): Promise<{ rows: BundleRow[]; cancelled: number }> {
  const stores = await db.store.findMany({ where: { id: { in: await productStores(productId, scope.storeIds) } }, select: { id: true, timezone: true } });
  const slices = (
    await Promise.all(
      stores.map((st) => {
        const tz = validTimezone(st.timezone);
        return loadOrderSlices(dayStart(range.from, tz), dayEnd(range.to, tz), st.id, productId);
      }),
    )
  ).flat();
  const map = new Map<string, BundleRow>();
  let cancelled = 0;
  for (const o of slices) {
    if (o.cancelled) {
      cancelled++;
      continue;
    }
    const price = cents(o.paid);
    const key = `${o.units}|${price}`;
    const row = map.get(key) ?? { quantity: o.units, price, orders: 0, revenue: 0, productCost: 0, shippingCost: 0, fees: 0, profit: 0 };
    row.orders += 1;
    row.revenue += sliceRevenue(o);
    row.productCost += o.cogs;
    row.shippingCost += o.shippingCost + o.handlingCost;
    row.fees += o.paymentFees + o.platformFees;
    row.profit += sliceProfit(o);
    map.set(key, row);
  }
  const rows = [...map.values()].map((r) => ({
    ...r,
    revenue: cents(r.revenue),
    productCost: cents(r.productCost),
    shippingCost: cents(r.shippingCost),
    fees: cents(r.fees),
    profit: cents(r.profit),
  }));
  rows.sort((a, b) => a.quantity - b.quantity || b.orders - a.orders || a.price - b.price);
  return { rows, cancelled };
}

export type CampaignSummary = {
  id: string;
  name: string;
  status: string;
  productId: string | null;
  /** The store its spend counts for; null = in a shared ad account and not linked yet. */
  storeId: string | null;
  spend: number;
  purchases: number;
  purchaseValue: number;
  roas: number; // Meta-reported
  cpa: number; // Meta-reported
};

/** Every campaign (including ones with no spend in the period), most spend first. */
export async function getCampaignSummaries(range: DateRange, scope: { storeIds: string[] }): Promise<CampaignSummary[]> {
  const [campaigns, sums] = await Promise.all([
    db.campaign.findMany({ where: campaignsOf(scope.storeIds), select: { id: true, name: true, status: true, productId: true, storeId: true } }),
    db.adInsight.groupBy({
      by: ["campaignId"],
      where: { date: { gte: range.from, lte: endOfUtcDay(range.to) }, campaign: campaignsOf(scope.storeIds) },
      _sum: { spend: true, purchases: true, purchaseValue: true },
    }),
  ]);
  const byId = new Map(sums.map((s) => [s.campaignId, s._sum]));
  const out = campaigns.map((c) => {
    const s = byId.get(c.id);
    const spend = cents(s?.spend ?? 0);
    const purchases = s?.purchases ?? 0;
    const purchaseValue = cents(s?.purchaseValue ?? 0);
    return { ...c, spend, purchases, purchaseValue, roas: safeDiv(purchaseValue, spend), cpa: safeDiv(spend, purchases) };
  });
  out.sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name));
  return out;
}

export type ProductSummary = {
  id: string;
  title: string;
  imageUrl: string | null;
  orders: number;
  units: number;
  revenue: number;
  costs: number; // product cost, shipping, handling, fees
  adSpend: number;
  netProfit: number;
  margin: number;
  roas: number; // Shopify revenue ÷ linked campaigns' spend
  campaigns: number;
};

/**
 * Products that earned money or had linked ad spend in the period, each with the
 * exact same numbers its product page shows. Free gifts and $0 bonuses are not
 * listed: their cost is already inside the product they ship with.
 */
export async function getProductSummaries(range: DateRange, scope: { storeIds: string[] }): Promise<{ products: ProductSummary[]; unlinkedSpend: number }> {
  const [paidLines, campaigns, variants] = await Promise.all([
    db.orderLineItem.findMany({
      where: { price: { gt: 0 }, order: await orderWindows(range, scope.storeIds), variant: { productId: { not: null } } },
      select: { variant: { select: { productId: true } } },
      distinct: ["variantId"],
    }),
    getCampaignSummaries(range, scope),
    db.productVariant.findMany({ where: { storeId: { in: scope.storeIds } }, select: { productId: true, productTitle: true, imageUrl: true }, orderBy: { shopifyId: "asc" } }),
  ]);
  const ids = new Set<string>();
  for (const l of paidLines) if (l.variant?.productId) ids.add(l.variant.productId);
  const campaignCount = new Map<string, number>();
  let unlinkedSpend = 0;
  for (const c of campaigns) {
    if (c.productId) {
      campaignCount.set(c.productId, (campaignCount.get(c.productId) ?? 0) + 1);
      if (c.spend > 0) ids.add(c.productId);
    } else unlinkedSpend += c.spend;
  }
  const info = new Map<string, { title: string; imageUrl: string | null }>();
  for (const v of variants) if (v.productId && !info.has(v.productId)) info.set(v.productId, { title: v.productTitle, imageUrl: v.imageUrl });

  const products = await Promise.all(
    [...ids].filter((id) => info.has(id)).map(async (id) => {
      const { totals: t } = await getMetrics(range, scope, id, { previous: false });
      return {
        id,
        title: info.get(id)!.title,
        imageUrl: info.get(id)!.imageUrl,
        orders: t.orders,
        units: t.units,
        revenue: t.revenue,
        costs: cents(t.cogs + t.fulfillmentCost + t.totalFees + t.tax),
        adSpend: t.adSpend,
        netProfit: t.netProfit,
        margin: t.margin,
        roas: t.mer,
        campaigns: campaignCount.get(id) ?? 0,
      };
    }),
  );
  products.sort((a, b) => b.revenue - a.revenue || b.adSpend - a.adSpend);
  return { products, unlinkedSpend: cents(unlinkedSpend) };
}

export type OrderRow = {
  id: string;
  storeId: string | null;
  name: string;
  createdAt: Date;
  country: string | null;
  status: string;
  cancelled: boolean;
  items: string;
  revenue: number; // what the customer paid, less refunds (Shopify total sales)
  productCost: number;
  shippingCost: number; // supplier shipping + handling
  fees: number;
  profit: number; // before ad spend and expenses
};

/** Orders placed in the period, newest first, with each order's own profit. */
export async function getOrderRows(range: DateRange, scope: { storeIds: string[] }, limit = 500): Promise<OrderRow[]> {
  const orders = await db.order.findMany({
    where: await orderWindows(range, scope.storeIds),
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { lineItems: { select: { title: true, quantity: true, price: true } } },
  });
  return orders.map((o) => {
    const revenue = cents(o.subtotal + o.shippingCharged + o.tax - o.refunded);
    const fees = cents(o.transactionFees + o.platformFees);
    const shippingCost = cents(o.shippingCost + o.handlingCost);
    return {
      id: o.id,
      storeId: o.storeId,
      name: o.name,
      createdAt: o.createdAt,
      country: o.country,
      status: o.cancelledAt ? "Cancelled" : (o.financialStatus ?? "").toLowerCase().replace(/_/g, " "),
      cancelled: o.cancelledAt !== null,
      items: o.lineItems.map((li) => `${li.quantity}× ${li.title}${li.price === 0 ? " (free)" : ""}`).join(", "),
      revenue,
      productCost: cents(o.cogs),
      shippingCost,
      fees,
      profit: cents(revenue - o.tax - o.cogs - shippingCost - fees),
    };
  });
}

import "server-only";
import { subDays } from "date-fns";
import { db } from "../db";
import { eachDay, endOfUtcDay, toISODate, type DateRange } from "../dates";
import { categoryGroup, type CashGroup } from "./categories";

const cents = (n: number) => Math.round(n * 100) / 100;

export type CategoryTotal = { category: string; amount: number; count: number };

export type CashReport = {
  connected: boolean;
  /** The day the bank history starts (the first transaction Plaid gave us). */
  since: Date | null;
  balance: number;
  /** What the counted accounts held before the first transaction. */
  opening: number;
  /** Since `since`: money the business made or lost in cash, the owner's own movements, and the rest. */
  allTime: Record<CashGroup, number>;
  /** In the chosen period. */
  period: {
    moneyIn: number;
    moneyOut: number;
    net: number;
    byGroup: Record<CashGroup, number>;
    byCategory: CategoryTotal[];
    unsortedCount: number;
    series: { date: string; moneyIn: number; moneyOut: number }[];
    weekly: boolean;
    payoutsByStore: { storeId: string | null; amount: number }[];
  };
  pending: { count: number; amount: number };
  shopify: { storeId: string; name: string; color: string; balance: number | null; balanceAt: Date | null; scheduled: number; onTheWay: number; note: string | null }[];
};

const zero = (): Record<CashGroup, number> => ({ business: 0, owner: 0, transfer: 0, unsorted: 0 });

/**
 * Everything the Cash page shows. The bank balance is split so the parts always add up to it:
 * balance = opening + business + owner + transfers + not sorted yet (all since `since`).
 */
export async function getCashReport(range: DateRange): Promise<CashReport> {
  const [accounts, stores] = await Promise.all([
    db.bankAccount.findMany({ where: { included: true } }),
    db.store.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, color: true, shopifyBalance: true, shopifyBalanceAt: true, shopifyPayoutsNote: true, shopifyDomain: true } }),
  ]);
  const ids = accounts.map((a) => a.id);
  // A credit balance is money owed, so it counts against the cash.
  const balance = cents(accounts.reduce((s, a) => s + (a.type === "credit" ? -(a.currentBalance ?? 0) : (a.currentBalance ?? 0)), 0));

  const [posted, pendingRows, inPeriod, payouts] = await Promise.all([
    db.bankTransaction.groupBy({ by: ["category"], where: { accountId: { in: ids }, pending: false }, _sum: { amount: true }, _min: { date: true } }),
    db.bankTransaction.aggregate({ where: { accountId: { in: ids }, pending: true }, _sum: { amount: true }, _count: true }),
    db.bankTransaction.findMany({
      where: { accountId: { in: ids }, pending: false, date: { gte: range.from, lte: endOfUtcDay(range.to) } },
      select: { date: true, amount: true, category: true, storeId: true },
    }),
    db.shopifyPayout.findMany({ where: { OR: [{ status: "SCHEDULED" }, { status: "PAID", bankTransaction: null, issuedAt: { gte: subDays(new Date(), 7) } }] } }),
  ]);

  const allTime = zero();
  let since: Date | null = null;
  for (const g of posted) {
    allTime[categoryGroup(g.category)] += g._sum.amount ?? 0;
    if (g._min.date && (!since || g._min.date < since)) since = g._min.date;
  }
  const totalChange = Object.values(allTime).reduce((s, n) => s + n, 0);
  for (const k of Object.keys(allTime) as CashGroup[]) allTime[k] = cents(allTime[k]);

  // The period: totals per category, per group, and a day (or week) series for the chart.
  const byCat = new Map<string, CategoryTotal>();
  const byGroup = zero();
  const days = eachDay(range.from, range.to);
  const weekly = days.length > 45;
  const bucket = (d: string) => (weekly ? days[Math.floor(days.indexOf(d) / 7) * 7] : d);
  const series = new Map<string, { date: string; moneyIn: number; moneyOut: number }>();
  for (const d of days) if (!series.has(bucket(d))) series.set(bucket(d), { date: bucket(d), moneyIn: 0, moneyOut: 0 });
  let moneyIn = 0;
  let moneyOut = 0;
  let unsortedCount = 0;
  const payoutsByStore = new Map<string | null, number>();
  for (const t of inPeriod) {
    const group = categoryGroup(t.category);
    const c = byCat.get(t.category) ?? { category: t.category, amount: 0, count: 0 };
    c.amount += t.amount;
    c.count++;
    byCat.set(t.category, c);
    byGroup[group] += t.amount;
    if (t.category === "UNSORTED") unsortedCount++;
    if (t.category === "SHOPIFY_PAYOUT") payoutsByStore.set(t.storeId, (payoutsByStore.get(t.storeId) ?? 0) + t.amount);
    // Moving money between your own accounts is neither in nor out.
    if (group === "transfer") continue;
    const point = series.get(bucket(toISODate(t.date)));
    if (t.amount > 0) {
      moneyIn += t.amount;
      if (point) point.moneyIn += t.amount;
    } else {
      moneyOut += -t.amount;
      if (point) point.moneyOut += -t.amount;
    }
  }

  const shopify = stores
    .filter((s) => s.shopifyDomain)
    .map((s) => {
      const mine = payouts.filter((p) => p.storeId === s.id);
      return {
        storeId: s.id,
        name: s.name,
        color: s.color,
        balance: s.shopifyBalance,
        balanceAt: s.shopifyBalanceAt,
        scheduled: cents(mine.filter((p) => p.status === "SCHEDULED").reduce((n, p) => n + p.net, 0)),
        // Paid by Shopify in the last week but not seen in the bank yet.
        onTheWay: cents(mine.filter((p) => p.status === "PAID").reduce((n, p) => n + p.net, 0)),
        note: s.shopifyPayoutsNote,
      };
    });

  return {
    connected: accounts.length > 0,
    since,
    balance,
    opening: cents(balance - totalChange),
    allTime,
    period: {
      moneyIn: cents(moneyIn),
      moneyOut: cents(moneyOut),
      net: cents(moneyIn - moneyOut),
      byGroup: Object.fromEntries(Object.entries(byGroup).map(([k, v]) => [k, cents(v)])) as Record<CashGroup, number>,
      byCategory: [...byCat.values()].map((c) => ({ ...c, amount: cents(c.amount) })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)), // biggest first
      unsortedCount,
      series: [...series.values()].map((p) => ({ ...p, moneyIn: cents(p.moneyIn), moneyOut: cents(p.moneyOut) })),
      weekly,
      payoutsByStore: [...payoutsByStore.entries()].map(([storeId, amount]) => ({ storeId, amount: cents(amount) })),
    },
    pending: { count: pendingRows._count, amount: cents(pendingRows._sum.amount ?? 0) },
    shopify,
  };
}

/** The bank lines for the list under the totals: the period, newest first, unsorted first when asked. */
export async function getCashTransactions(range: DateRange, opts: { onlyUnsorted?: boolean; take?: number } = {}) {
  return db.bankTransaction.findMany({
    where: {
      account: { included: true },
      date: { gte: range.from, lte: endOfUtcDay(range.to) },
      ...(opts.onlyUnsorted ? { category: "UNSORTED" } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: opts.take ?? 300,
    include: { account: { select: { name: true, mask: true } }, payout: { select: { issuedAt: true, storeId: true } } },
  });
}


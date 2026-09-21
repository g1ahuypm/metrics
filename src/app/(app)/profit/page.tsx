import Link from "next/link";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { rangeToSearch, resolveRange } from "@/lib/dates";
import { fmtDate, fmtMoney, fmtMultiple, fmtNumber, fmtPercent } from "@/lib/format";
import { getDataStatus, getMetrics } from "@/lib/metrics";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { KpiCard } from "@/components/KpiCard";
import { ProfitBreakdown } from "@/components/ProfitBreakdown";
import { BarSeriesChart } from "@/components/charts/BarSeriesChart";
import { EmptyState } from "@/components/EmptyState";

export default async function ProfitPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  await requireUser();
  const range = resolveRange(await searchParams);
  const [report, status] = await Promise.all([getMetrics(range), getDataStatus()]);
  const { totals: t, previous: p, daily } = report;
  const currency = status.settings?.currency ?? "USD";
  const hasData = status.orderCount > 0 || status.insightCount > 0;

  const costStack = daily.map((d) => ({
    date: d.date,
    cogs: d.cogs,
    fulfillment: d.fulfillmentCost,
    fees: d.totalFees + d.tax,
    ads: d.adSpend,
    other: d.customCosts,
  }));

  return (
    <div>
      <PageHeader title="Profit & Loss" description="Every line between what customers paid and what you keep.">
        <DateRangePicker range={range} />
        <Link href={`/api/export/daily?${rangeToSearch(range)}`} className="btn-secondary" prefetch={false}>
          <Download className="h-4 w-4" /> Export CSV
        </Link>
      </PageHeader>

      {!hasData ? (
        <EmptyState
          title="No data yet"
          description="Connect Shopify and Meta Ads in Settings and run a sync to build your P&L."
          actionHref="/settings"
          actionLabel="Go to settings"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard hero label="Net profit" value={fmtMoney(t.netProfit, currency)} raw={t.netProfit} previous={p.netProfit} />
            <KpiCard label="Revenue" value={fmtMoney(t.revenue, currency)} raw={t.revenue} previous={p.revenue} />
            <KpiCard label="Gross profit" value={fmtMoney(t.grossProfit, currency)} raw={t.grossProfit} previous={p.grossProfit} />
            <KpiCard label="Total costs" value={fmtMoney(t.totalCosts, currency)} raw={t.totalCosts} previous={p.totalCosts} upIsGood={false} />
            <KpiCard label="Net margin" value={fmtPercent(t.margin)} raw={t.margin} previous={p.margin} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Gross margin" value={fmtPercent(t.grossMargin)} raw={t.grossMargin} previous={p.grossMargin} />
            <KpiCard label="COGS % of revenue" value={fmtPercent(t.cogsPercent)} raw={t.cogsPercent} previous={p.cogsPercent} upIsGood={false} />
            <KpiCard label="Ad spend % of revenue" value={fmtPercent(t.adSpendPercent)} raw={t.adSpendPercent} previous={p.adSpendPercent} upIsGood={false} />
            <KpiCard label="Discount rate" value={fmtPercent(t.discountRate)} raw={t.discountRate} previous={p.discountRate} upIsGood={false} />
            <KpiCard label="Refund rate" value={fmtPercent(t.refundRate)} raw={t.refundRate} previous={p.refundRate} upIsGood={false} />
            <KpiCard label="Break-even ROAS" value={fmtMultiple(t.breakEvenRoas)} raw={t.breakEvenRoas} previous={p.breakEvenRoas} upIsGood={false} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-5 lg:items-start">
            <div className="card p-4 lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold">Statement</h2>
              <ProfitBreakdown totals={t} currency={currency} />
            </div>
            <div className="card p-4 lg:col-span-3">
              <h2 className="mb-1 text-sm font-semibold">Costs per day</h2>
              <p className="mb-2 text-xs text-ink-3">Stacked by type. Taxes are grouped with fees.</p>
              <BarSeriesChart
                data={costStack}
                currency={currency}
                stacked
                height={300}
                series={[
                  { key: "cogs", label: "Cost of goods", color: "var(--series-1)" },
                  { key: "ads", label: "Ad spend", color: "var(--series-2)" },
                  { key: "fulfillment", label: "Shipping & handling", color: "var(--series-3)" },
                  { key: "fees", label: "Fees & taxes", color: "var(--series-4)" },
                  { key: "other", label: "Other costs", color: "var(--ink-3)" },
                ]}
              />
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <PerOrder label="Revenue / order" value={fmtMoney(t.aov, currency)} />
                <PerOrder label="COGS / order" value={fmtMoney(t.cogsPerOrder, currency)} />
                <PerOrder label="Fulfillment / order" value={fmtMoney(t.fulfillmentPerOrder, currency)} />
                <PerOrder label="Fees / order" value={fmtMoney(t.feesPerOrder, currency)} />
                <PerOrder label="Ad spend / order" value={fmtMoney(t.blendedCpa, currency)} />
                <PerOrder label="Gross profit / order" value={fmtMoney(t.grossProfitPerOrder, currency)} />
                <PerOrder label="Net profit / order" value={fmtMoney(t.profitPerOrder, currency)} />
                <PerOrder label="Units / order" value={fmtNumber(t.unitsPerOrder, 2)} />
              </div>
            </div>
          </div>

          <div className="mt-6 card overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-sm font-semibold">Daily ledger</h2>
              <p className="text-xs text-ink-3">One row per day. Totals at the bottom match the statement above to the cent.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Orders</th>
                    <th className="text-right">Gross sales</th>
                    <th className="text-right">Discounts</th>
                    <th className="text-right">Refunds</th>
                    <th className="text-right">Shipping</th>
                    <th className="text-right">Tax</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">COGS</th>
                    <th className="text-right">Fulfillment</th>
                    <th className="text-right">Fees</th>
                    <th className="text-right">Gross profit</th>
                    <th className="text-right">Ad spend</th>
                    <th className="text-right">Other</th>
                    <th className="text-right">Net profit</th>
                    <th className="text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {[...daily].reverse().map((d) => (
                    <tr key={d.date}>
                      <td className="whitespace-nowrap font-medium">{fmtDate(d.date, { weekday: "short", month: "short", day: "numeric" })}</td>
                      <td className="text-right tnum">{fmtNumber(d.orders)}</td>
                      <td className="text-right tnum">{fmtMoney(d.grossSales, currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(d.discounts, currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(d.refunds, currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(d.shippingCharged, currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(d.tax, currency)}</td>
                      <td className="text-right tnum font-medium">{fmtMoney(d.revenue, currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(d.cogs, currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(d.fulfillmentCost, currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(d.totalFees, currency)}</td>
                      <td className="text-right tnum font-medium">{fmtMoney(d.grossProfit, currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(d.adSpend, currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(d.customCosts, currency)}</td>
                      <td className={`text-right tnum font-semibold ${d.netProfit < 0 ? "text-bad-text" : ""}`}>{fmtMoney(d.netProfit, currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtPercent(d.revenue ? d.netProfit / d.revenue : 0, 0)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold bg-surface-2">
                    <td>Total</td>
                    <td className="text-right tnum">{fmtNumber(t.orders)}</td>
                    <td className="text-right tnum">{fmtMoney(t.grossSales, currency)}</td>
                    <td className="text-right tnum">{fmtMoney(t.discounts, currency)}</td>
                    <td className="text-right tnum">{fmtMoney(t.refunds, currency)}</td>
                    <td className="text-right tnum">{fmtMoney(t.shippingCharged, currency)}</td>
                    <td className="text-right tnum">{fmtMoney(t.tax, currency)}</td>
                    <td className="text-right tnum">{fmtMoney(t.revenue, currency)}</td>
                    <td className="text-right tnum">{fmtMoney(t.cogs, currency)}</td>
                    <td className="text-right tnum">{fmtMoney(t.fulfillmentCost, currency)}</td>
                    <td className="text-right tnum">{fmtMoney(t.totalFees, currency)}</td>
                    <td className="text-right tnum">{fmtMoney(t.grossProfit, currency)}</td>
                    <td className="text-right tnum">{fmtMoney(t.adSpend, currency)}</td>
                    <td className="text-right tnum">{fmtMoney(t.customCosts, currency)}</td>
                    <td className={`text-right tnum ${t.netProfit < 0 ? "text-bad-text" : ""}`}>{fmtMoney(t.netProfit, currency)}</td>
                    <td className="text-right tnum">{fmtPercent(t.margin, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PerOrder({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <div className="text-ink-3">{label}</div>
      <div className="mt-0.5 text-sm font-medium tnum">{value}</div>
    </div>
  );
}

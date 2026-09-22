import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { rangeToSearch, resolveRange } from "@/lib/dates";
import { fmtMoney, fmtNumber, fmtPercent } from "@/lib/format";
import { getDataStatus, getMetrics } from "@/lib/metrics";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { KpiCard } from "@/components/KpiCard";
import { StatStrip } from "@/components/StatStrip";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { ProfitBreakdown } from "@/components/ProfitBreakdown";
import { DataBanner } from "@/components/DataBanner";
import { EmptyState } from "@/components/EmptyState";

type Search = { range?: string; from?: string; to?: string; denied?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const range = resolveRange(sp);
  const [report, status] = await Promise.all([getMetrics(range), getDataStatus()]);
  const { totals: t, previous: p, daily } = report;
  const currency = status.settings?.currency ?? "USD";
  const hasData = status.orderCount > 0 || status.insightCount > 0;

  return (
    <div>
      <PageHeader title="Dashboard" description={`${range.label} · ${range.days} day${range.days === 1 ? "" : "s"}`}>
        <DateRangePicker range={range} />
      </PageHeader>

      {sp.denied && <div className="alert-error mb-4">You need owner or admin access for that page.</div>}

      <DataBanner shopifyConnected={status.shopifyConnected} metaConnected={status.metaConnected} hasData={hasData} role={user.role} />

      {!hasData ? (
        <EmptyState
          title="No data yet"
          description="Connect Shopify and Meta Ads in Settings and run a sync, or seed demo data with `npm run db:seed` to explore the dashboard."
          actionHref="/settings"
          actionLabel="Go to settings"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard hero label="Net profit" value={fmtMoney(t.netProfit, currency)} raw={t.netProfit} previous={p.netProfit} sub={`${fmtPercent(t.margin)} net margin`} />
            <KpiCard label="Revenue" value={fmtMoney(t.revenue, currency)} raw={t.revenue} previous={p.revenue} />
            <KpiCard label="Orders" value={fmtNumber(t.orders)} raw={t.orders} previous={p.orders} />
            <KpiCard label="Ad spend" value={fmtMoney(t.adSpend, currency)} raw={t.adSpend} previous={p.adSpend} upIsGood={false} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-5 lg:items-start">
            <div className="card p-4 lg:col-span-3">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">Revenue, ad spend and net profit</h2>
                <span className="text-xs text-ink-3">per day</span>
              </div>
              <TimeSeriesChart
                data={daily}
                currency={currency}
                height={300}
                series={[
                  { key: "revenue", label: "Revenue", color: "var(--series-1)", area: true },
                  { key: "adSpend", label: "Ad spend", color: "var(--series-2)" },
                  { key: "netProfit", label: "Net profit", color: "var(--series-3)" },
                ]}
              />
              <div className="mt-4 border-t border-border pt-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Per order</div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  <Per label="Average order value" value={fmtMoney(t.aov, currency)} />
                  <Per label="Product cost" value={fmtMoney(t.cogsPerOrder, currency)} />
                  <Per label="Shipping & handling" value={fmtMoney(t.fulfillmentPerOrder, currency)} />
                  <Per label="Fees" value={fmtMoney(t.feesPerOrder, currency)} />
                  <Per label="Ad spend" value={fmtMoney(t.blendedCpa, currency)} />
                  <Per label="Gross profit" value={fmtMoney(t.grossProfitPerOrder, currency)} />
                  <Per label="Net profit" value={fmtMoney(t.profitPerOrder, currency)} />
                  <Per label="New customers" value={`${fmtNumber(t.newCustomers)} of ${fmtNumber(t.orders)}`} />
                </dl>
              </div>
            </div>
            <div className="card p-4 lg:col-span-2">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">Profit & loss</h2>
                <Link href={`/profit?${rangeToSearch(range)}`} className="text-xs text-accent hover:underline">
                  Full statement
                </Link>
              </div>
              <ProfitBreakdown totals={t} currency={currency} compact />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Per({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="font-medium tnum">{value}</dd>
    </div>
  );
}

import { requireUser } from "@/lib/auth";
import { resolveRange } from "@/lib/dates";
import { fmtMoney, fmtMultiple, fmtNumber, fmtPercent } from "@/lib/format";
import { getCampaignBreakdown, getDataStatus, getMetrics, getProductBreakdown } from "@/lib/metrics";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { KpiCard } from "@/components/KpiCard";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { ProfitBreakdown } from "@/components/ProfitBreakdown";
import { DataBanner } from "@/components/DataBanner";
import { EmptyState } from "@/components/EmptyState";
import Link from "next/link";

type Search = { range?: string; from?: string; to?: string; denied?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const range = resolveRange(sp);
  const [report, status, campaigns, products] = await Promise.all([
    getMetrics(range),
    getDataStatus(),
    getCampaignBreakdown(range),
    getProductBreakdown(range),
  ]);
  const { totals: t, previous: p, daily } = report;
  const currency = status.settings?.currency ?? "USD";
  const hasData = status.orderCount > 0 || status.insightCount > 0;

  return (
    <div>
      <PageHeader title="Dashboard" description={`${range.label} · ${range.days} day${range.days === 1 ? "" : "s"}`}>
        <DateRangePicker range={range} />
      </PageHeader>

      {sp.denied && <div className="alert-error mb-4">You need owner or admin access for that page.</div>}

      <DataBanner
        shopifyConnected={status.shopifyConnected}
        metaConnected={status.metaConnected}
        hasData={hasData}
        role={user.role}
      />

      {!hasData ? (
        <EmptyState
          title="No data yet"
          description="Connect Shopify and Meta Ads in Settings and run a sync, or seed demo data with `npm run db:seed` to explore the dashboard."
          actionHref="/settings"
          actionLabel="Go to settings"
        />
      ) : (
        <>
          {/* Headline KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard hero label="Net profit" value={fmtMoney(t.netProfit, currency)} raw={t.netProfit} previous={p.netProfit} />
            <KpiCard label="Revenue" value={fmtMoney(t.revenue, currency)} raw={t.revenue} previous={p.revenue} />
            <KpiCard label="Gross profit" value={fmtMoney(t.grossProfit, currency)} raw={t.grossProfit} previous={p.grossProfit} />
            <KpiCard label="Ad spend" value={fmtMoney(t.adSpend, currency)} raw={t.adSpend} previous={p.adSpend} upIsGood={false} />
            <KpiCard label="Orders" value={fmtNumber(t.orders)} raw={t.orders} previous={p.orders} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Net margin" value={fmtPercent(t.margin)} raw={t.margin} previous={p.margin} />
            <KpiCard label="Gross margin" value={fmtPercent(t.grossMargin)} raw={t.grossMargin} previous={p.grossMargin} />
            <KpiCard label="MER (revenue ÷ ad spend)" value={fmtMultiple(t.mer)} raw={t.mer} previous={p.mer} />
            <KpiCard label="Meta ROAS" value={fmtMultiple(t.roas)} raw={t.roas} previous={p.roas} />
            <KpiCard label="POAS (gross profit ÷ ad spend)" value={fmtMultiple(t.poas)} raw={t.poas} previous={p.poas} />
            <KpiCard label="Break-even ROAS" value={fmtMultiple(t.breakEvenRoas)} raw={t.breakEvenRoas} previous={p.breakEvenRoas} upIsGood={false} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Average order value" value={fmtMoney(t.aov, currency)} raw={t.aov} previous={p.aov} />
            <KpiCard label="Profit per order" value={fmtMoney(t.profitPerOrder, currency)} raw={t.profitPerOrder} previous={p.profitPerOrder} />
            <KpiCard label="Blended CPA" value={fmtMoney(t.blendedCpa, currency)} raw={t.blendedCpa} previous={p.blendedCpa} upIsGood={false} />
            <KpiCard label="Cost per new customer" value={fmtMoney(t.ncpa, currency)} raw={t.ncpa} previous={p.ncpa} upIsGood={false} />
            <KpiCard label="New customers" value={fmtNumber(t.newCustomers)} raw={t.newCustomers} previous={p.newCustomers} />
            <KpiCard label="Repeat order rate" value={fmtPercent(t.repeatRate)} raw={t.repeatRate} previous={p.repeatRate} />
          </div>

          {/* Trend + breakdown */}
          <div className="mt-6 grid gap-4 lg:grid-cols-5 lg:items-start">
            <div className="card p-4 lg:col-span-3">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">Revenue, ad spend and net profit</h2>
                <span className="text-xs text-ink-3">per day</span>
              </div>
              <TimeSeriesChart
                data={daily}
                currency={currency}
                series={[
                  { key: "revenue", label: "Revenue", color: "var(--series-1)", area: true },
                  { key: "adSpend", label: "Ad spend", color: "var(--series-2)" },
                  { key: "netProfit", label: "Net profit", color: "var(--series-3)" },
                ]}
              />
            </div>
            <div className="card p-4 lg:col-span-2">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">Profit & loss</h2>
                <Link href={`/profit?${rangeQuery(sp)}`} className="text-xs text-accent hover:underline">
                  Full statement
                </Link>
              </div>
              <ProfitBreakdown totals={t} currency={currency} compact />
            </div>
          </div>

          {/* Top campaigns + top products */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h2 className="text-sm font-semibold">Top campaigns by spend</h2>
                <Link href={`/ads?${rangeQuery(sp)}`} className="text-xs text-accent hover:underline">
                  View all
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th className="text-right">Spend</th>
                      <th className="text-right">ROAS</th>
                      <th className="text-right">CPA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.slice(0, 6).map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className="max-w-[220px] truncate font-medium">{c.name}</div>
                          <div className="text-[11px] text-ink-3">{c.status}</div>
                        </td>
                        <td className="text-right tnum">{fmtMoney(c.spend, currency)}</td>
                        <td className="text-right tnum">{fmtMultiple(c.roas)}</td>
                        <td className="text-right tnum">{fmtMoney(c.cpa, currency)}</td>
                      </tr>
                    ))}
                    {campaigns.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center text-ink-3">No campaign data in this period</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h2 className="text-sm font-semibold">Top products by revenue</h2>
                <Link href={`/sales?${rangeQuery(sp)}`} className="text-xs text-accent hover:underline">
                  View all
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="text-right">Units</th>
                      <th className="text-right">Revenue</th>
                      <th className="text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.slice(0, 6).map((pr) => (
                      <tr key={pr.variantId ?? pr.title}>
                        <td>
                          <div className="max-w-[220px] truncate font-medium">{pr.title}</div>
                          {pr.sku && <div className="text-[11px] text-ink-3">{pr.sku}</div>}
                        </td>
                        <td className="text-right tnum">{fmtNumber(pr.units)}</td>
                        <td className="text-right tnum">{fmtMoney(pr.revenue, currency)}</td>
                        <td className="text-right tnum">{fmtPercent(pr.margin, 0)}</td>
                      </tr>
                    ))}
                    {products.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center text-ink-3">No sales in this period</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function rangeQuery(sp: Search): string {
  const q = new URLSearchParams();
  if (sp.from && sp.to) {
    q.set("from", sp.from);
    q.set("to", sp.to);
  } else if (sp.range) q.set("range", sp.range);
  return q.toString();
}

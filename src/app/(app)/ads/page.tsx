import { requireUser } from "@/lib/auth";
import { resolveRange } from "@/lib/dates";
import { fmtMoney, fmtMultiple, fmtNumber, fmtPercent } from "@/lib/format";
import { getCampaignBreakdown, getDataStatus, getMetrics } from "@/lib/metrics";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { KpiCard } from "@/components/KpiCard";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { EmptyState } from "@/components/EmptyState";

function statusBadge(status: string) {
  const s = status.toUpperCase();
  const tone = s === "ACTIVE" ? "text-good-text" : s === "PAUSED" ? "text-warn-text" : "text-ink-3";
  return (
    <span className={`badge ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.charAt(0) + s.slice(1).toLowerCase()}
    </span>
  );
}

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  await requireUser();
  const range = resolveRange(await searchParams);
  const [report, status, campaigns] = await Promise.all([getMetrics(range), getDataStatus(), getCampaignBreakdown(range)]);
  const { totals: t, previous: p, daily } = report;
  const currency = status.settings?.currency ?? "USD";

  const totalRow = campaigns.reduce(
    (acc, c) => {
      acc.spend += c.spend;
      acc.impressions += c.impressions;
      acc.clicks += c.clicks;
      acc.purchases += c.purchases;
      acc.purchaseValue += c.purchaseValue;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0 },
  );

  return (
    <div>
      <PageHeader title="Meta Ads" description="Facebook and Instagram campaign performance, matched against your real sales">
        <DateRangePicker range={range} />
      </PageHeader>

      {status.insightCount === 0 ? (
        <EmptyState
          title="No ad data synced yet"
          description="Connect your Meta ad account in Settings and run a sync to import campaigns and daily spend."
          actionHref="/settings"
          actionLabel="Connect Meta Ads"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Ad spend" value={fmtMoney(t.adSpend, currency)} raw={t.adSpend} previous={p.adSpend} upIsGood={false} />
            <KpiCard label="Meta ROAS" value={fmtMultiple(t.roas)} raw={t.roas} previous={p.roas} />
            <KpiCard label="MER (revenue ÷ spend)" value={fmtMultiple(t.mer)} raw={t.mer} previous={p.mer} />
            <KpiCard label="Meta CPA" value={fmtMoney(t.cpa, currency)} raw={t.cpa} previous={p.cpa} upIsGood={false} />
            <KpiCard label="Cost per new customer" value={fmtMoney(t.ncpa, currency)} raw={t.ncpa} previous={p.ncpa} upIsGood={false} />
            <KpiCard label="Meta purchases" value={fmtNumber(t.adPurchases)} raw={t.adPurchases} previous={p.adPurchases} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Impressions" value={fmtNumber(t.impressions)} raw={t.impressions} previous={p.impressions} />
            <KpiCard label="Link clicks" value={fmtNumber(t.clicks)} raw={t.clicks} previous={p.clicks} />
            <KpiCard label="CTR" value={fmtPercent(t.ctr, 2)} raw={t.ctr} previous={p.ctr} />
            <KpiCard label="CPC" value={fmtMoney(t.cpc, currency)} raw={t.cpc} previous={p.cpc} upIsGood={false} />
            <KpiCard label="CPM" value={fmtMoney(t.cpm, currency)} raw={t.cpm} previous={p.cpm} upIsGood={false} />
            <KpiCard label="Shopify orders" value={fmtNumber(t.orders)} raw={t.orders} previous={p.orders} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-semibold">Ad spend vs Meta-attributed revenue</h2>
              <TimeSeriesChart
                data={daily}
                currency={currency}
                height={240}
                series={[
                  { key: "adPurchaseValue", label: "Meta purchase value", color: "var(--series-1)", area: true },
                  { key: "adSpend", label: "Ad spend", color: "var(--series-2)" },
                ]}
              />
            </div>
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-semibold">Meta purchases vs Shopify orders</h2>
              <p className="mb-2 text-xs text-ink-3">A gap between the two is normal. Meta counts by attribution window; Shopify counts real orders.</p>
              <TimeSeriesChart
                data={daily}
                format="number"
                height={216}
                series={[
                  { key: "orders", label: "Shopify orders", color: "var(--series-1)" },
                  { key: "adPurchases", label: "Meta purchases", color: "var(--series-2)" },
                ]}
              />
            </div>
          </div>

          <div className="mt-6 card overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-sm font-semibold">Campaigns</h2>
              <p className="text-xs text-ink-3">Sorted by spend. Metrics are Meta-reported for the selected period.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Status</th>
                    <th className="text-right">Spend</th>
                    <th className="text-right">Purchases</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">ROAS</th>
                    <th className="text-right">CPA</th>
                    <th className="text-right">CTR</th>
                    <th className="text-right">CPC</th>
                    <th className="text-right">CPM</th>
                    <th className="text-right">Impr.</th>
                    <th className="text-right">Freq.</th>
                    <th className="text-right">ATC</th>
                    <th className="text-right">Checkouts</th>
                    <th className="text-right">Budget/day</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="max-w-[260px] truncate font-medium">{c.name}</div>
                        {c.objective && <div className="text-[11px] text-ink-3">{c.objective.replace(/^OUTCOME_/, "").toLowerCase()}</div>}
                      </td>
                      <td>{statusBadge(c.status)}</td>
                      <td className="text-right tnum">{fmtMoney(c.spend, currency)}</td>
                      <td className="text-right tnum">{fmtNumber(c.purchases)}</td>
                      <td className="text-right tnum">{fmtMoney(c.purchaseValue, currency)}</td>
                      <td className={`text-right tnum font-medium ${c.roas >= 2 ? "text-good-text" : c.roas > 0 && c.roas < 1 ? "text-bad-text" : ""}`}>{fmtMultiple(c.roas)}</td>
                      <td className="text-right tnum">{fmtMoney(c.cpa, currency)}</td>
                      <td className="text-right tnum">{fmtPercent(c.ctr, 2)}</td>
                      <td className="text-right tnum">{fmtMoney(c.cpc, currency)}</td>
                      <td className="text-right tnum">{fmtMoney(c.cpm, currency)}</td>
                      <td className="text-right tnum">{fmtNumber(c.impressions)}</td>
                      <td className="text-right tnum text-ink-2">{fmtNumber(c.frequency, 2)}</td>
                      <td className="text-right tnum text-ink-2">{fmtNumber(c.addToCart)}</td>
                      <td className="text-right tnum text-ink-2">{fmtNumber(c.initiateCheckout)}</td>
                      <td className="text-right tnum text-ink-2">{c.dailyBudget ? fmtMoney(c.dailyBudget, currency) : "—"}</td>
                    </tr>
                  ))}
                  {campaigns.length > 0 && (
                    <tr className="font-semibold">
                      <td>Total</td>
                      <td></td>
                      <td className="text-right tnum">{fmtMoney(totalRow.spend, currency)}</td>
                      <td className="text-right tnum">{fmtNumber(totalRow.purchases)}</td>
                      <td className="text-right tnum">{fmtMoney(totalRow.purchaseValue, currency)}</td>
                      <td className="text-right tnum">{fmtMultiple(totalRow.spend ? totalRow.purchaseValue / totalRow.spend : 0)}</td>
                      <td className="text-right tnum">{fmtMoney(totalRow.purchases ? totalRow.spend / totalRow.purchases : 0, currency)}</td>
                      <td className="text-right tnum">{fmtPercent(totalRow.impressions ? totalRow.clicks / totalRow.impressions : 0, 2)}</td>
                      <td className="text-right tnum">{fmtMoney(totalRow.clicks ? totalRow.spend / totalRow.clicks : 0, currency)}</td>
                      <td className="text-right tnum">{fmtMoney(totalRow.impressions ? (totalRow.spend / totalRow.impressions) * 1000 : 0, currency)}</td>
                      <td className="text-right tnum">{fmtNumber(totalRow.impressions)}</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  )}
                  {campaigns.length === 0 && (
                    <tr>
                      <td colSpan={15} className="text-center text-ink-3">No campaign data in this period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

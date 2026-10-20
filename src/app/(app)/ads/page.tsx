import Link from "next/link";
import { Megaphone, ShoppingBag, Target, TrendingUp } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getScope } from "@/lib/scope";
import { productHref } from "@/lib/links";
import { fmtMoney, fmtMultiple, fmtNumber, fmtPercent } from "@/lib/format";
import { getCampaignBreakdown, getCampaignSummaries, getDataStatus, getMetrics, getProductOptions } from "@/lib/metrics";
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
  const { range } = await getScope(await searchParams);
  const [report, status, detail, all, products] = await Promise.all([
    getMetrics(range),
    getDataStatus(),
    getCampaignBreakdown(range),
    getCampaignSummaries(range),
    getProductOptions(),
  ]);
  const titleOf = new Map(products.map((p) => [p.id, p.title]));
  const detailOf = new Map(detail.map((d) => [d.id, d]));
  const campaigns = all.filter((c) => c.spend > 0);
  const { totals: t, previous: p, daily } = report;
  const currency = status.settings?.currency ?? "USD";
  const unlinked = campaigns.filter((c) => !c.productId);

  return (
    <div>
      <PageHeader title="Meta Ads" description={`Every campaign as Meta reports it · ${range.label}`}>
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard icon={Megaphone} tint="orange" label="Ad spend" value={fmtMoney(t.adSpend, currency)} raw={t.adSpend} previous={p.adSpend} upIsGood={false} />
            <KpiCard icon={TrendingUp} label="True ROAS" value={fmtMultiple(t.mer)} raw={t.mer} previous={p.mer} sub="Shopify revenue ÷ spend" />
            <KpiCard icon={Target} label="Meta ROAS" value={fmtMultiple(t.roas)} raw={t.roas} previous={p.roas} sub={`${fmtNumber(t.adPurchases)} Meta purchases`} />
            <KpiCard icon={ShoppingBag} tint="good" label="Cost per order" value={fmtMoney(t.blendedCpa, currency)} raw={t.blendedCpa} previous={p.blendedCpa} upIsGood={false} sub={`${fmtNumber(t.orders)} Shopify orders`} />
          </div>

          {daily.length > 1 && (
            <div className="card mt-4 p-4">
              <h2 className="mb-2 text-sm font-semibold">Ad spend vs Shopify revenue</h2>
              <TimeSeriesChart
                data={daily}
                currency={currency}
                height={220}
                series={[
                  { key: "revenue", label: "Shopify revenue", color: "var(--series-1)", area: true },
                  { key: "adSpend", label: "Ad spend", color: "var(--series-2)" },
                ]}
              />
            </div>
          )}

          {unlinked.length > 0 && (
            <div className="mt-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink-2">
              {unlinked.length} campaign{unlinked.length === 1 ? " is" : "s are"} not linked to a product ({fmtMoney(unlinked.reduce((s, c) => s + c.spend, 0), currency)} spend). Link
              them on the{" "}
              <Link href="/products" className="font-medium text-accent hover:underline">
                product&apos;s page
              </Link>
              .
            </div>
          )}

          <div className="card mt-4 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Product</th>
                    <th className="text-right">Spend</th>
                    <th className="text-right">Purchases</th>
                    <th className="text-right">ROAS</th>
                    <th className="text-right">CPA</th>
                    <th className="text-right">CTR</th>
                    <th className="text-right">CPC</th>
                    <th className="text-right">CPM</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => {
                    const d = detailOf.get(c.id);
                    return (
                      <tr key={c.id}>
                        <td>
                          <div className="max-w-[300px] truncate font-medium" title={c.name}>{c.name}</div>
                          <div className="mt-0.5">{statusBadge(c.status)}</div>
                        </td>
                        <td>
                          {c.productId ? (
                            <Link href={productHref(c.productId)} className="block max-w-[200px] truncate text-xs text-accent hover:underline">
                              {titleOf.get(c.productId) ?? "Product"}
                            </Link>
                          ) : (
                            <span className="text-xs text-warn-text">Not linked</span>
                          )}
                        </td>
                        <td className="text-right tnum">{fmtMoney(c.spend, currency)}</td>
                        <td className="text-right tnum">{fmtNumber(c.purchases)}</td>
                        <td className="text-right tnum font-medium">{fmtMultiple(c.roas)}</td>
                        <td className="text-right tnum">{fmtMoney(c.cpa, currency)}</td>
                        <td className="text-right tnum text-ink-2">{fmtPercent(d?.ctr ?? 0, 2)}</td>
                        <td className="text-right tnum text-ink-2">{fmtMoney(d?.cpc ?? 0, currency)}</td>
                        <td className="text-right tnum text-ink-2">{fmtMoney(d?.cpm ?? 0, currency)}</td>
                      </tr>
                    );
                  })}
                  {campaigns.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center text-ink-3">
                        No ad spend in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border px-4 py-2 text-[11px] text-ink-3">
              Purchases, ROAS and CPA here are Meta&apos;s own attribution. True ROAS above uses your real Shopify revenue.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

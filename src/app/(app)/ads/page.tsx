import { requireUser } from "@/lib/auth";
import { resolveRange, viewQuery } from "@/lib/dates";
import { fmtMoney, fmtMultiple, fmtNumber, fmtPercent } from "@/lib/format";
import { getCampaignBreakdown, getDataStatus, getMetrics, getProductOptions } from "@/lib/metrics";
import { canEdit } from "@/lib/auth-shared";
import { ProductPicker } from "@/components/ProductPicker";
import { ProductScope } from "@/components/ProductScope";
import { AutoMatchButton, CampaignProductSelect } from "./CampaignLinks";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { KpiCard } from "@/components/KpiCard";
import { StatStrip } from "@/components/StatStrip";
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

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; product?: string }> }) {
  const user = await requireUser();
  const editor = canEdit(user.role);
  const sp = await searchParams;
  const range = resolveRange(sp);
  const productId = sp.product || undefined;
  const [report, status, campaigns, products] = await Promise.all([
    getMetrics(range, productId),
    getDataStatus(),
    getCampaignBreakdown(range, productId),
    getProductOptions(),
  ]);
  const product = productId ? products.find((p) => p.id === productId) : undefined;
  const unlinked = campaigns.filter((c) => !c.productId).length;
  const titleOf = new Map(products.map((p) => [p.id, p.title]));
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
        <ProductPicker products={products} value={productId ?? ""} />
        <DateRangePicker range={range} />
      </PageHeader>

      <ProductScope product={product} query={viewQuery(sp)} page="ads" />

      {status.insightCount === 0 ? (
        <EmptyState
          title="No ad data synced yet"
          description="Connect your Meta ad account in Settings and run a sync to import campaigns and daily spend."
          actionHref="/settings"
          actionLabel="Connect Meta Ads"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="Ad spend" value={fmtMoney(t.adSpend, currency)} raw={t.adSpend} previous={p.adSpend} upIsGood={false} />
            <KpiCard label="Meta ROAS" value={fmtMultiple(t.roas)} raw={t.roas} previous={p.roas} />
            <KpiCard label="Meta CPA" value={fmtMoney(t.cpa, currency)} raw={t.cpa} previous={p.cpa} upIsGood={false} />
            <KpiCard label="Meta purchases" value={fmtNumber(t.adPurchases)} raw={t.adPurchases} previous={p.adPurchases} />
            <KpiCard label="MER (revenue ÷ spend)" value={fmtMultiple(t.mer)} raw={t.mer} previous={p.mer} />
          </div>
          <div className="mt-3">
            <StatStrip
              title="Delivery and funnel"
              items={[
                { label: "Impressions", value: fmtNumber(t.impressions), raw: t.impressions, previous: p.impressions },
                { label: "Reach", value: fmtNumber(t.reach), raw: t.reach, previous: p.reach },
                { label: "Link clicks", value: fmtNumber(t.clicks), raw: t.clicks, previous: p.clicks },
                { label: "CTR", value: fmtPercent(t.ctr, 2), raw: t.ctr, previous: p.ctr },
                { label: "CPC", value: fmtMoney(t.cpc, currency), raw: t.cpc, previous: p.cpc, upIsGood: false },
                { label: "CPM", value: fmtMoney(t.cpm, currency), raw: t.cpm, previous: p.cpm, upIsGood: false },
                { label: "Cost per new customer", value: fmtMoney(t.ncpa, currency), raw: t.ncpa, previous: p.ncpa, upIsGood: false },
              ]}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
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

          <div className="mt-4 card overflow-hidden">
            <div className="flex flex-col gap-2 px-4 pt-4 pb-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold">Campaigns</h2>
                <p className="text-xs text-ink-3">
                  Sorted by spend. Metrics are Meta-reported for the selected period.
                  {editor && " Use \u201cSells product\u201d to link each campaign to the product it advertises; the product selector then shows only those campaigns."}
                  {!productId && unlinked > 0 && <span className="text-warn-text"> {unlinked} campaign{unlinked === 1 ? "" : "s"} not linked yet.</span>}
                </p>
              </div>
              {editor && <AutoMatchButton />}
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Sells product</th>
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
                      <td>
                        {editor ? (
                          <CampaignProductSelect campaignId={c.id} productId={c.productId} products={products.map((p) => ({ id: p.id, title: p.title }))} />
                        ) : (
                          <span className="text-xs text-ink-2">{c.productId ? titleOf.get(c.productId) ?? "Linked" : "Not linked"}</span>
                        )}
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
                      <td colSpan={16} className="text-center text-ink-3">
                        {productId ? "No campaigns are linked to this product. Clear the product filter and use “Sells product” to link them." : "No campaign data in this period"}
                      </td>
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

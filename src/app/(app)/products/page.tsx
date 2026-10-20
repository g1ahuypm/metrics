import Link from "next/link";
import { ChevronRight, Gift } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getScope } from "@/lib/scope";
import { fmtMoney, fmtMultiple, fmtNumber, fmtPercent } from "@/lib/format";
import { getDataStatus, getProductSummaries } from "@/lib/metrics";
import { getProductCostData } from "@/lib/productcosts";
import { costCoverage } from "@/lib/costcoverage";
import { marketLabel } from "@/lib/constants";
import { productHref } from "@/lib/links";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { EmptyState } from "@/components/EmptyState";

function Thumb({ url }: { url: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" /> : <div className="h-9 w-9 shrink-0 rounded-md bg-surface-2" />;
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireUser();
  const scope = await getScope(user, await searchParams);
  const { range } = scope;
  const [{ products, unlinkedSpend }, costData, status] = await Promise.all([
    getProductSummaries(range, scope),
    getProductCostData(undefined, scope.storeIds),
    getDataStatus(scope),
  ]);
  const currency = status.currency;
  const coverage = new Map(costData.map((p) => [p.productId, { ...costCoverage(p), isFreeGift: p.isFreeGift }]));
  const listed = new Set(products.map((p) => p.id));
  // Everything else, with the ones that need costs first.
  const others = costData
    .filter((p) => !listed.has(p.productId) && !p.productId.startsWith("variant:"))
    .map((p) => ({ ...p, cov: coverage.get(p.productId)! }))
    .sort((a, b) => Number(b.cov.missing.length > 0) - Number(a.cov.missing.length > 0) || a.title.localeCompare(b.title));
  const missingText = (id: string) => {
    const m = coverage.get(id)?.missing ?? [];
    return m.length ? `Missing costs: ${m.map((c) => (c ? marketLabel(c) : "unknown")).join(", ")}` : null;
  };

  return (
    <div>
      <PageHeader title="Products" description={`Each product's real profit, with only its own campaigns' ad spend · ${range.label}`}>
        <DateRangePicker range={range} />
      </PageHeader>

      {products.length === 0 && others.length === 0 ? (
        <EmptyState title="No products yet" description="Connect Shopify in Settings and run a sync to import your products." actionHref="/settings" actionLabel="Connect Shopify" />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-right">Orders</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Costs</th>
                    <th className="text-right">Ad spend</th>
                    <th className="text-right">ROAS</th>
                    <th className="text-right">Net profit</th>
                    <th className="text-right">Margin</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const missing = missingText(p.id);
                    return (
                      <tr key={p.id} className="cursor-pointer">
                        <td>
                          <Link href={productHref(p.id)} className="flex min-w-[220px] items-center gap-3">
                            <Thumb url={p.imageUrl} />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{p.title}</span>
                              <span className="block text-[11px] text-ink-3">
                                {missing ? (
                                  <span className="text-warn-text">{missing}</span>
                                ) : p.campaigns === 0 ? (
                                  <span className="text-warn-text">No campaigns linked</span>
                                ) : (
                                  `${p.campaigns} campaign${p.campaigns === 1 ? "" : "s"} linked`
                                )}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="text-right tnum">{fmtNumber(p.orders)}</td>
                        <td className="text-right tnum">{fmtMoney(p.revenue, currency)}</td>
                        <td className="text-right tnum text-ink-2">{fmtMoney(p.costs, currency)}</td>
                        <td className="text-right tnum text-ink-2">{fmtMoney(p.adSpend, currency)}</td>
                        <td className="text-right tnum">{p.adSpend > 0 ? fmtMultiple(p.roas) : "—"}</td>
                        <td className={`text-right tnum font-semibold ${p.netProfit < 0 ? "text-bad-text" : ""}`}>{fmtMoney(p.netProfit, currency)}</td>
                        <td className="text-right tnum">{p.revenue > 0 ? fmtPercent(p.margin, 0) : "—"}</td>
                        <td className="text-right">
                          <Link href={productHref(p.id)} className="btn-ghost px-1.5 py-1" aria-label={`Open ${p.title}`}>
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center text-ink-3">
                        No sales in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {unlinkedSpend > 0 && (
              <p className="border-t border-border px-4 py-2.5 text-xs text-warn-text">
                {fmtMoney(unlinkedSpend, currency)} of ad spend in this period is from campaigns not linked to any product. Open a product to link its campaigns.
              </p>
            )}
          </div>

          {others.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-1 text-sm font-semibold">Other products</h2>
              <p className="mb-3 text-xs text-ink-3">
                No sales in this period. Free gifts and bonuses are counted inside the product they ship with. Open one to set its costs.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {others.map((p) => {
                  const missing = missingText(p.productId);
                  return (
                    <Link key={p.productId} href={productHref(p.productId)} className="card flex min-w-0 items-center gap-3 p-2.5 hover:border-border-strong">
                      <Thumb url={p.imageUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{p.title}</span>
                        <span className="block text-[11px] text-ink-3">
                          {p.cov.isFreeGift && (
                            <span className="mr-2 inline-flex items-center gap-1 text-accent">
                              <Gift className="h-3 w-3" /> Free gift
                            </span>
                          )}
                          {missing ? <span className="text-warn-text">{missing}</span> : p.cov.noCost ? "No cost" : p.cov.anyCountry ? "Costs set" : "No costs entered"}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-ink-3" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

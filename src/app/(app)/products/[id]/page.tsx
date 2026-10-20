import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Gift } from "lucide-react";
import { canEdit, requireUser } from "@/lib/auth";
import { scopeQuery } from "@/lib/dates";
import { getScope } from "@/lib/scope";
import { db } from "@/lib/db";
import { allowedStores } from "@/lib/stores";
import { productIdFromParam } from "@/lib/links";
import { fmtMoney, fmtNumber, safeDiv } from "@/lib/format";
import { getBundleBreakdown, getCampaignSummaries, getDataStatus, getMetrics, getProductOptions } from "@/lib/metrics";
import { getProductCostData } from "@/lib/productcosts";
import { costCoverage } from "@/lib/costcoverage";
import { marketLabel } from "@/lib/constants";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ProfitOverview } from "@/components/ProfitOverview";
import { DataBanner } from "@/components/DataBanner";
import { ProductCostEditor } from "@/components/costs/ProductCostEditor";
import { ProductSwitcher } from "./ProductSwitcher";
import { CampaignPicker } from "./CampaignPicker";

type Search = { range?: string; from?: string; to?: string };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const user = await requireUser();
  const editor = canEdit(user.role);
  const productId = productIdFromParam((await params).id);
  if (!productId) notFound();
  // A product page always shows the product's own store (in its time zone), whatever the switcher says.
  const allowed = (await allowedStores(user)).map((s) => s.id);
  const home = await db.productVariant.findFirst({ where: { productId, storeId: { in: allowed } }, select: { storeId: true } });
  if (!home?.storeId) notFound();
  const scope = await getScope(user, { ...(await searchParams), store: home.storeId });
  const { range } = scope;
  const own = { storeIds: [home.storeId] };

  const [[costs], options, status, report, bundles, campaigns] = await Promise.all([
    getProductCostData(productId, own.storeIds),
    getProductOptions(own),
    getDataStatus(own),
    getMetrics(range, own, productId),
    getBundleBreakdown(range, own, productId),
    getCampaignSummaries(range, own),
  ]);
  if (!costs) notFound();
  const currency = status.currency;
  const hasData = status.orderCount > 0 || status.insightCount > 0;
  const linkedCount = campaigns.filter((c) => c.productId === productId).length;
  const missing = costCoverage(costs).missing;
  const titles = Object.fromEntries(options.map((o) => [o.id, o.title]));
  const switcher = options.some((o) => o.id === productId) ? options : [{ id: productId, title: costs.title, units: 0, campaigns: 0 }, ...options];

  return (
    <div>
      <Link href="/products" className="mb-3 inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Products
      </Link>
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {costs.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={costs.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="h-12 w-12 shrink-0 rounded-xl bg-surface-2" />
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{costs.title}</h1>
            <p className="text-sm text-ink-2">{range.label}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProductSwitcher products={switcher} value={productId} />
          <DateRangePicker range={range} />
          <Link href={`/api/export/daily?${scopeQuery(range, productId)}&store=${home.storeId}`} className="btn-ghost" prefetch={false} title="Download day-by-day numbers as CSV">
            <Download className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {costs.isFreeGift ? (
        <div className="card mb-4 flex items-start gap-3 p-4 text-sm text-ink-2">
          <Gift className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p>
            This is a free gift: customers always get it at $0. Its cost is counted inside the product it ships with, so it has no profit of its own.
            Just make sure its costs below are right.
          </p>
        </div>
      ) : (
        <>
          <DataBanner shopifyConnected={status.shopifyConnected} metaConnected={status.metaConnected} hasData={hasData} role={user.role} />
          {status.metaConnected && linkedCount === 0 && (
            <div className="mb-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink-2">
              No campaigns are linked to this product yet, so its ad spend is $0.{" "}
              <a href="#campaigns" className="font-medium text-accent hover:underline">
                Tick its campaigns below
              </a>
              .
            </div>
          )}

          <ProfitOverview report={report} currency={currency} adNote={linkedCount === 0 ? "No campaigns linked" : "No spend in this period"} />

          <section className="card mt-4 overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-sm font-semibold">Bundles</h2>
              <p className="text-xs text-ink-3">
                Each bundle at the exact price customers paid. <strong className="font-medium text-ink-2">Profit before ads</strong> per order is the most you
                can spend on ads to get one order and still break even.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Bundle</th>
                    <th className="text-right">Price paid</th>
                    <th className="text-right">Orders</th>
                    <th className="text-right">Product cost</th>
                    <th className="text-right">Shipping</th>
                    <th className="text-right">Fees</th>
                    <th className="text-right">Profit before ads</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {bundles.rows.map((b) => (
                    <tr key={`${b.quantity}-${b.price}`}>
                      <td className="whitespace-nowrap font-medium">Buy {b.quantity}</td>
                      <td className="text-right tnum font-medium">{fmtMoney(b.price, currency)}</td>
                      <td className="text-right tnum">{fmtNumber(b.orders)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(safeDiv(b.productCost, b.orders), currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(safeDiv(b.shippingCost, b.orders), currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(safeDiv(b.fees, b.orders), currency)}</td>
                      <td className={`text-right tnum font-semibold ${b.profit < 0 ? "text-bad-text" : "text-good-text"}`}>{fmtMoney(safeDiv(b.profit, b.orders), currency)}</td>
                      <td className="text-right tnum">{fmtMoney(b.profit, currency)}</td>
                    </tr>
                  ))}
                  {bundles.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-ink-3">
                        No orders in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2 text-[11px] text-ink-3">
              Product cost, shipping and fees are per order, and include any free gift in the order. Shipping a customer paid for is part of the price.
              {bundles.cancelled > 0 && ` ${bundles.cancelled} cancelled order${bundles.cancelled === 1 ? " is" : "s are"} not shown.`}
            </p>
            {missing.length > 0 && (
              <p className="border-t border-border px-4 py-2 text-xs text-warn-text">
                Orders shipping to {missing.map((c) => (c ? marketLabel(c) : "unknown countries")).join(", ")} have no costs yet and count as $0 cost.{" "}
                <a href="#costs" className="font-medium underline">
                  Add them below
                </a>
                .
              </p>
            )}
          </section>

          <section id="campaigns" className="card mt-4 scroll-mt-4 p-4">
            <h2 className="text-sm font-semibold">Campaigns that sell this product</h2>
            <p className="mb-3 text-xs text-ink-3">
              Tick every Meta campaign that advertises this product. Only ticked campaigns count toward its ad spend, ROAS and CPA above.
            </p>
            {campaigns.length === 0 ? (
              <p className="text-sm text-ink-2">
                {status.metaConnected ? "No campaigns synced yet. Run a Meta sync in Settings." : "Connect Meta Ads in Settings to see your campaigns here."}
              </p>
            ) : (
              <CampaignPicker productId={productId} campaigns={campaigns} productTitles={titles} currency={currency} editor={editor} />
            )}
          </section>
        </>
      )}

      <section id="costs" className="mt-4 scroll-mt-4">
        <ProductCostEditor product={costs} currency={currency} editor={editor} />
      </section>
    </div>
  );
}

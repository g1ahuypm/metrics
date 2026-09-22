import { requireUser } from "@/lib/auth";
import { resolveRange } from "@/lib/dates";
import { fmtDate, fmtMoney, fmtNumber, fmtPercent } from "@/lib/format";
import { getDataStatus, getMetrics, getProductBreakdown, getRecentOrders } from "@/lib/metrics";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { KpiCard } from "@/components/KpiCard";
import { StatStrip } from "@/components/StatStrip";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { BarSeriesChart } from "@/components/charts/BarSeriesChart";
import { EmptyState } from "@/components/EmptyState";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  await requireUser();
  const range = resolveRange(await searchParams);
  const [report, status, products, orders] = await Promise.all([
    getMetrics(range),
    getDataStatus(),
    getProductBreakdown(range),
    getRecentOrders(range, 50),
  ]);
  const { totals: t, previous: p, daily } = report;
  const currency = status.settings?.currency ?? "USD";

  return (
    <div>
      <PageHeader title="Sales" description="Shopify orders, products and customers">
        <DateRangePicker range={range} />
      </PageHeader>

      {status.orderCount === 0 ? (
        <EmptyState
          title="No orders synced yet"
          description="Connect your Shopify store in Settings and run a sync to import orders and products."
          actionHref="/settings"
          actionLabel="Connect Shopify"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="Revenue" value={fmtMoney(t.revenue, currency)} raw={t.revenue} previous={p.revenue} />
            <KpiCard label="Orders" value={fmtNumber(t.orders)} raw={t.orders} previous={p.orders} />
            <KpiCard label="Average order value" value={fmtMoney(t.aov, currency)} raw={t.aov} previous={p.aov} />
            <KpiCard label="New customers" value={fmtNumber(t.newCustomers)} raw={t.newCustomers} previous={p.newCustomers} />
            <KpiCard label="Refunds" value={fmtMoney(t.refunds, currency)} raw={t.refunds} previous={p.refunds} upIsGood={false} />
          </div>
          <div className="mt-3">
            <StatStrip
              title="Sales detail"
              items={[
                { label: "Gross sales", value: fmtMoney(t.grossSales, currency), raw: t.grossSales, previous: p.grossSales },
                { label: "Discounts", value: fmtMoney(t.discounts, currency), raw: t.discounts, previous: p.discounts, upIsGood: false },
                { label: "Net sales", value: fmtMoney(t.netSales, currency), raw: t.netSales, previous: p.netSales },
                { label: "Shipping charged", value: fmtMoney(t.shippingCharged, currency), raw: t.shippingCharged, previous: p.shippingCharged },
                { label: "Taxes collected", value: fmtMoney(t.tax, currency), raw: t.tax, previous: p.tax },
                { label: "Units sold", value: fmtNumber(t.units), raw: t.units, previous: p.units },
                { label: "Returning customers", value: fmtNumber(t.returningCustomers), raw: t.returningCustomers, previous: p.returningCustomers },
              ]}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-semibold">Revenue per day</h2>
              <TimeSeriesChart data={daily} currency={currency} height={240} series={[{ key: "revenue", label: "Revenue", color: "var(--series-1)", area: true }]} />
            </div>
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-semibold">Orders per day</h2>
              <BarSeriesChart
                data={daily}
                format="number"
                height={240}
                series={[
                  { key: "newCustomers", label: "New customers", color: "var(--series-3)" },
                  { key: "orders", label: "All orders", color: "var(--series-1)" },
                ]}
              />
            </div>
          </div>

          <div className="mt-4 card overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-sm font-semibold">Products</h2>
              <p className="text-xs text-ink-3">Revenue and margin per variant after product cost.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-right">Orders</th>
                    <th className="text-right">Units</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Product cost</th>
                    <th className="text-right">Gross profit</th>
                    <th className="text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((pr) => (
                    <tr key={pr.variantId ?? pr.title}>
                      <td>
                        <div className="font-medium">{pr.title}</div>
                        {pr.sku && <div className="text-[11px] text-ink-3">{pr.sku}</div>}
                      </td>
                      <td className="text-right tnum">{fmtNumber(pr.orders)}</td>
                      <td className="text-right tnum">{fmtNumber(pr.units)}</td>
                      <td className="text-right tnum">{fmtMoney(pr.revenue, currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(pr.cogs, currency)}</td>
                      <td className="text-right tnum font-medium">{fmtMoney(pr.grossProfit, currency)}</td>
                      <td className="text-right tnum">{fmtPercent(pr.margin, 1)}</td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-ink-3">No sales in this period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 card overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-sm font-semibold">Recent orders</h2>
              <p className="text-xs text-ink-3">Latest 50 orders in the selected period, with the cost of each one.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Refunded</th>
                    <th className="text-right">Product cost</th>
                    <th className="text-right">Shipping</th>
                    <th className="text-right">Fees</th>
                    <th className="text-right">Profit</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const profit = o.total - o.refunded - o.tax - o.cogs - o.shippingCost - o.handlingCost - o.transactionFees - o.platformFees;
                    return (
                      <tr key={o.id} className={o.cancelledAt ? "opacity-50" : ""}>
                        <td className="font-medium">{o.name}</td>
                        <td className="whitespace-nowrap text-ink-2">{fmtDate(o.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                        <td>
                          <div className="max-w-[180px] truncate">{o.customerEmail ?? "Guest"}</div>
                          {o.isNewCustomer && <span className="badge">New</span>}
                        </td>
                        <td className="text-ink-2">
                          <div className="max-w-[220px] truncate">{o.lineItems.map((li) => `${li.quantity}× ${li.title}`).join(", ")}</div>
                        </td>
                        <td className="text-right tnum">{fmtMoney(o.total, currency)}</td>
                        <td className="text-right tnum text-ink-2">{o.refunded ? fmtMoney(o.refunded, currency) : "—"}</td>
                        <td className="text-right tnum text-ink-2">{fmtMoney(o.cogs, currency)}</td>
                        <td className="text-right tnum text-ink-2">{fmtMoney(o.shippingCost + o.handlingCost, currency)}</td>
                        <td className="text-right tnum text-ink-2">{fmtMoney(o.transactionFees + o.platformFees, currency)}</td>
                        <td className={`text-right tnum font-medium ${profit < 0 ? "text-bad-text" : ""}`}>{fmtMoney(profit, currency)}</td>
                        <td>
                          <span className="badge">{o.cancelledAt ? "Cancelled" : (o.financialStatus ?? "—").toLowerCase().replace(/_/g, " ")}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={11} className="text-center text-ink-3">No orders in this period</td>
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

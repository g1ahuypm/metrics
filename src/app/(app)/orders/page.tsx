import { requireUser } from "@/lib/auth";
import { getScope } from "@/lib/scope";
import { fmtDateTime, fmtMoney, fmtNumber } from "@/lib/format";
import { getDataStatus, getOrderRows } from "@/lib/metrics";
import { marketLabel } from "@/lib/constants";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { EmptyState } from "@/components/EmptyState";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  await requireUser();
  const { range } = await getScope(await searchParams);
  const [orders, status] = await Promise.all([getOrderRows(range), getDataStatus()]);
  const currency = status.settings?.currency ?? "USD";
  const sum = (k: "revenue" | "productCost" | "shippingCost" | "fees" | "profit") => orders.reduce((s, o) => s + o[k], 0);

  return (
    <div>
      <PageHeader title="Orders" description={`Every Shopify order and what it made you, before ad spend · ${range.label}`}>
        <DateRangePicker range={range} />
      </PageHeader>

      {orders.length === 0 ? (
        <EmptyState title="No orders in this period" description="Pick a longer date range, or connect Shopify in Settings." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Placed</th>
                  <th>Ships to</th>
                  <th>Items</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Product cost</th>
                  <th className="text-right">Shipping</th>
                  <th className="text-right">Fees</th>
                  <th className="text-right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className={o.cancelled ? "text-ink-3" : ""}>
                    <td className="whitespace-nowrap font-medium">
                      {o.name}
                      {o.cancelled && <span className="badge ml-2">Cancelled</span>}
                    </td>
                    <td className="whitespace-nowrap text-ink-2">{fmtDateTime(o.createdAt, range.tz)}</td>
                    <td className="text-ink-2">{o.country ? marketLabel(o.country) : "—"}</td>
                    <td className="max-w-[320px] truncate text-ink-2" title={o.items}>{o.items}</td>
                    <td className="text-right tnum">{fmtMoney(o.revenue, currency)}</td>
                    <td className="text-right tnum text-ink-2">{fmtMoney(o.productCost, currency)}</td>
                    <td className="text-right tnum text-ink-2">{fmtMoney(o.shippingCost, currency)}</td>
                    <td className="text-right tnum text-ink-2">{fmtMoney(o.fees, currency)}</td>
                    <td className={`text-right tnum font-medium ${o.profit < 0 ? "text-bad-text" : ""}`}>{fmtMoney(o.profit, currency)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td colSpan={4}>
                    {fmtNumber(orders.length)} order{orders.length === 1 ? "" : "s"}
                  </td>
                  <td className="text-right tnum">{fmtMoney(sum("revenue"), currency)}</td>
                  <td className="text-right tnum">{fmtMoney(sum("productCost"), currency)}</td>
                  <td className="text-right tnum">{fmtMoney(sum("shippingCost"), currency)}</td>
                  <td className="text-right tnum">{fmtMoney(sum("fees"), currency)}</td>
                  <td className="text-right tnum">{fmtMoney(sum("profit"), currency)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {orders.length >= 500 && <p className="px-4 py-2 text-xs text-ink-3">Showing the newest 500 orders. Pick a shorter range to see older ones.</p>}
        </div>
      )}
    </div>
  );
}

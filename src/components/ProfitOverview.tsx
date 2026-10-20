import { fmtDate, fmtMoney, fmtMultiple, fmtNumber, fmtPercent } from "@/lib/format";
import type { MetricsReport } from "@/lib/metrics";
import { Megaphone, PieChart, ShoppingBag, TrendingUp } from "lucide-react";
import { KpiCard } from "./KpiCard";
import { ProfitBreakdown } from "./ProfitBreakdown";
import { TimeSeriesChart } from "./charts/TimeSeriesChart";

/**
 * The four numbers that matter, a daily chart, the profit statement and a day-by-day
 * table. The dashboard (whole store) and every product page use the same block.
 */
export function ProfitOverview({ report, currency, adNote }: { report: MetricsReport; currency: string; adNote?: string }) {
  const { totals: t, previous: p, daily } = report;
  const days = [...daily].reverse();
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={ShoppingBag} label="Revenue" value={fmtMoney(t.revenue, currency)} raw={t.revenue} previous={p.revenue} sub={`${fmtNumber(t.orders)} order${t.orders === 1 ? "" : "s"}`} />
        <KpiCard
          icon={Megaphone}
          tint="orange"
          label="Ad spend"
          value={fmtMoney(t.adSpend, currency)}
          raw={t.adSpend}
          previous={p.adSpend}
          upIsGood={false}
          sub={t.adSpend > 0 ? `ROAS ${fmtMultiple(t.mer)} · CPA ${fmtMoney(t.blendedCpa, currency)}` : adNote}
        />
        <KpiCard
          icon={TrendingUp}
          featured
          label="Net profit"
          value={fmtMoney(t.netProfit, currency)}
          raw={t.netProfit}
          previous={p.netProfit}
          sub={t.orders > 0 ? `${fmtMoney(t.profitPerOrder, currency)} per order` : undefined}
        />
        <KpiCard icon={PieChart} tint="good" label="Margin" value={fmtPercent(t.margin, 1)} raw={t.margin} previous={p.margin} sub="of revenue" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5 lg:items-start">
        <div className="card min-w-0 p-4 lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">Profit</h2>
          <ProfitBreakdown totals={t} currency={currency} />
        </div>
        <div className="card min-w-0 p-4 lg:col-span-3">
          <h2 className="mb-2 text-sm font-semibold">Day by day</h2>
          {daily.length > 1 && (
            <TimeSeriesChart
              data={daily}
              currency={currency}
              height={200}
              series={[
                { key: "revenue", label: "Revenue", color: "var(--series-1)", area: true },
                { key: "adSpend", label: "Ad spend", color: "var(--series-2)" },
                { key: "netProfit", label: "Net profit", color: "var(--series-3)" },
              ]}
            />
          )}
          <div className={`max-h-[420px] overflow-auto ${daily.length > 1 ? "mt-3" : ""}`}>
            <table className="table">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  <th>Day</th>
                  <th className="text-right">Orders</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Costs</th>
                  <th className="text-right">Ad spend</th>
                  <th className="text-right">Net profit</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const costs = d.revenue - d.grossProfit; // taxes, product, shipping, handling, fees
                  return (
                    <tr key={d.date}>
                      <td className="whitespace-nowrap">{fmtDate(d.date)}</td>
                      <td className="text-right tnum">{fmtNumber(d.orders)}</td>
                      <td className="text-right tnum">{fmtMoney(d.revenue, currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(costs, currency)}</td>
                      <td className="text-right tnum text-ink-2">{fmtMoney(d.adSpend, currency)}</td>
                      <td className={`text-right tnum font-medium ${d.netProfit < 0 ? "text-bad-text" : ""}`}>{fmtMoney(d.netProfit, currency)}</td>
                    </tr>
                  );
                })}
                {days.length > 1 && (
                  <tr className="font-semibold">
                    <td>Total</td>
                    <td className="text-right tnum">{fmtNumber(t.orders)}</td>
                    <td className="text-right tnum">{fmtMoney(t.revenue, currency)}</td>
                    <td className="text-right tnum">{fmtMoney(t.revenue - t.grossProfit, currency)}</td>
                    <td className="text-right tnum">{fmtMoney(t.adSpend, currency)}</td>
                    <td className={`text-right tnum ${t.netProfit < 0 ? "text-bad-text" : ""}`}>{fmtMoney(t.netProfit, currency)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink-3">Costs = product, shipping, handling and payment fees. Expenses are included in net profit.</p>
        </div>
      </div>
    </>
  );
}

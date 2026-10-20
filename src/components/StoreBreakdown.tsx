import { fmtMoney, fmtMultiple, fmtPercent } from "@/lib/format";
import type { StoreTotals } from "@/lib/metrics";

/** "All stores": each store's own numbers side by side. */
export function StoreBreakdown({ stores, unlinkedSpend, currency }: { stores: StoreTotals[]; unlinkedSpend: number; currency: string }) {
  if (stores.length === 0) return null;
  return (
    <div className="card mt-4 overflow-hidden">
      <div className="px-4 pt-4 pb-2 sm:px-5">
        <h2 className="text-sm font-bold">By store</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="table min-w-[640px]">
          <thead>
            <tr>
              <th>Store</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">Orders</th>
              <th className="text-right">Ad spend</th>
              <th className="text-right">ROAS</th>
              <th className="text-right">Net profit</th>
              <th className="text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {stores.map(({ id, name, color, totals: t }) => (
              <tr key={id}>
                <td>
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                    {name}
                  </span>
                </td>
                <td className="tnum text-right">{fmtMoney(t.revenue, currency)}</td>
                <td className="tnum text-right">{t.orders}</td>
                <td className="tnum text-right">{fmtMoney(t.adSpend, currency)}</td>
                <td className="tnum text-right">{t.adSpend > 0 ? fmtMultiple(t.mer) : "—"}</td>
                <td className={`tnum text-right font-bold ${t.netProfit < 0 ? "text-bad-text" : "text-good-text"}`}>{fmtMoney(t.netProfit, currency)}</td>
                <td className="tnum text-right">{fmtPercent(t.margin, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unlinkedSpend > 0 && (
        <p className="border-t border-border px-4 py-3 text-xs text-ink-2 sm:px-5">
          Includes {fmtMoney(unlinkedSpend, currency)} of ad spend from a shared ad account that isn&apos;t linked to a store yet. Tick its campaigns on the
          product pages to count it for the right store.
        </p>
      )}
    </div>
  );
}

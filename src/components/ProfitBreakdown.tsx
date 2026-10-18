import { fmtMoney, fmtPercent, safeDiv } from "@/lib/format";
import type { Totals } from "@/lib/metrics";

type Row = { label: string; value: number; total?: boolean; note?: string };

/**
 * Revenue at the top, every cost below it, net profit at the bottom.
 * Lines that are zero and optional (taxes, handling, expenses) are left out.
 */
export function buildPnlRows(t: Totals): Row[] {
  const rows: Row[] = [{ label: "Revenue", value: t.revenue, total: true, note: "What customers paid, after discounts and refunds" }];
  if (t.tax > 0) rows.push({ label: "Taxes", value: -t.tax });
  rows.push({ label: "Product cost", value: -t.cogs });
  rows.push({ label: "Shipping cost", value: -t.shippingCost });
  if (t.handlingCost > 0) rows.push({ label: "Handling", value: -t.handlingCost });
  rows.push({ label: "Payment fees", value: -t.totalFees });
  rows.push({ label: "Profit before ads", value: t.grossProfit, total: true });
  rows.push({ label: "Meta ads", value: -t.adSpend });
  for (const [cat, v] of Object.entries(t.customCostBreakdown).sort((a, b) => b[1] - a[1])) rows.push({ label: cat, value: -v });
  rows.push({ label: "Net profit", value: t.netProfit, total: true });
  return rows;
}

export function ProfitBreakdown({ totals, currency }: { totals: Totals; currency: string }) {
  const rows = buildPnlRows(totals);
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={r.total && i > 0 ? "border-t border-border-strong" : ""}>
            <td className={`py-1.5 pr-2 ${r.total ? "font-semibold" : "pl-3 text-ink-2"}`}>{r.label}</td>
            <td className={`py-1.5 text-right tnum whitespace-nowrap ${r.total ? "font-semibold" : ""} ${r.total && r.value < 0 ? "text-bad-text" : ""}`}>
              {r.total ? fmtMoney(r.value, currency) : `−${fmtMoney(Math.abs(r.value), currency)}`}
            </td>
            <td className="w-14 py-1.5 text-right text-xs text-ink-3 tnum">{fmtPercent(safeDiv(Math.abs(r.value), totals.revenue), 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

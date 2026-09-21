import { fmtMoney, fmtPercent, safeDiv } from "@/lib/format";
import type { Totals } from "@/lib/metrics";

type Row =
  | { kind: "line"; label: string; value: number; note?: string; sign?: "+" | "−" }
  | { kind: "subtotal"; label: string; value: number; note?: string }
  | { kind: "group"; label: string };

export function buildPnlRows(t: Totals): Row[] {
  const other: Row[] = Object.entries(t.customCostBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, v]) => ({ kind: "line", label: cat, value: -v, sign: "−" }));
  return [
    { kind: "group", label: "Sales" },
    { kind: "line", label: "Gross sales", value: t.grossSales, note: "Items at list price", sign: "+" },
    { kind: "line", label: "Discounts", value: -t.discounts, sign: "−" },
    { kind: "line", label: "Refunds", value: -t.refunds, sign: "−" },
    { kind: "subtotal", label: "Net sales", value: t.netSales },
    { kind: "line", label: "Shipping charged", value: t.shippingCharged, note: "Paid by customers", sign: "+" },
    { kind: "line", label: "Taxes collected", value: t.tax, sign: "+" },
    { kind: "subtotal", label: "Revenue", value: t.revenue, note: "Shopify “Total sales”" },
    { kind: "group", label: "Cost of sales" },
    { kind: "line", label: "Taxes remitted", value: -t.tax, note: "Pass-through", sign: "−" },
    { kind: "line", label: "Cost of goods sold", value: -t.cogs, sign: "−" },
    { kind: "line", label: "Shipping cost", value: -t.shippingCost, note: "Labels & carrier", sign: "−" },
    { kind: "line", label: "Handling cost", value: -t.handlingCost, note: "Pick, pack, packaging", sign: "−" },
    { kind: "line", label: "Payment processing", value: -t.paymentFees, note: "Shopify Payments / gateway", sign: "−" },
    { kind: "line", label: "Shopify platform fees", value: -t.platformFees, note: "Third-party gateway surcharge", sign: "−" },
    { kind: "subtotal", label: "Gross profit", value: t.grossProfit, note: `${fmtPercent(t.grossMargin, 1)} gross margin` },
    { kind: "group", label: "Marketing & overhead" },
    { kind: "line", label: "Meta ad spend", value: -t.adSpend, sign: "−" },
    ...(other.length > 0 ? other : [{ kind: "line", label: "Other costs", value: 0, sign: "−" } as Row]),
    { kind: "subtotal", label: "Net profit", value: t.netProfit, note: `${fmtPercent(t.margin, 1)} net margin` },
  ];
}

export function ProfitBreakdown({ totals, currency, compact = false }: { totals: Totals; currency: string; compact?: boolean }) {
  const rows = buildPnlRows(totals);
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r, i) => {
          if (r.kind === "group") {
            return (
              <tr key={i}>
                <td colSpan={3} className={`pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3 ${i === 0 ? "" : "pt-3"}`}>
                  {r.label}
                </td>
              </tr>
            );
          }
          const isSub = r.kind === "subtotal";
          const negative = r.value < 0;
          return (
            <tr key={i} className={isSub ? "border-t border-border-strong" : ""}>
              <td className={`py-1 pr-2 ${isSub ? "font-semibold" : "text-ink-2"}`}>
                <div className="flex items-baseline gap-1.5">
                  {!isSub && <span className="w-2 text-ink-3">{r.sign}</span>}
                  <span>{r.label}</span>
                </div>
                {r.note && !compact && <div className="pl-3.5 text-[11px] text-ink-3">{r.note}</div>}
              </td>
              <td className={`py-1 text-right tnum whitespace-nowrap ${isSub ? "font-semibold" : ""} ${isSub && negative ? "text-bad-text" : ""}`}>
                {fmtMoney(isSub ? r.value : Math.abs(r.value), currency)}
              </td>
              <td className="hidden w-14 py-1 text-right text-xs text-ink-3 tnum sm:table-cell">
                {fmtPercent(safeDiv(Math.abs(r.value), totals.revenue), 1)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

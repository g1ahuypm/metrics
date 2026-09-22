import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { pctChange } from "@/lib/format";

export type Stat = { label: string; value: string; raw?: number; previous?: number; upIsGood?: boolean };

/** A quiet row of secondary numbers. Use for detail that supports the headline tiles. */
export function StatStrip({ title, items }: { title?: string; items: Stat[] }) {
  return (
    <div className="card px-4 py-3">
      {title && <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{title}</div>}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
        {items.map((s) => {
          const change = s.raw !== undefined && s.previous !== undefined ? pctChange(s.raw, s.previous) : undefined;
          let tone = "text-ink-3";
          let Icon = ArrowUpRight;
          if (change !== undefined && change !== null && Math.abs(change) >= 0.0005) {
            const up = change > 0;
            tone = up === (s.upIsGood ?? true) ? "text-good-text" : "text-bad-text";
            Icon = up ? ArrowUpRight : ArrowDownRight;
          }
          return (
            <div key={s.label} className="min-w-0">
              <dt className="truncate text-xs text-ink-3" title={s.label}>{s.label}</dt>
              <dd className="mt-0.5 flex items-baseline gap-1.5">
                <span className="truncate text-sm font-semibold tnum">{s.value}</span>
                {change !== undefined && change !== null && (
                  <span className={`inline-flex items-center text-[11px] ${tone}`}>
                    <Icon className="h-3 w-3" />
                    {Math.abs(change * 100).toFixed(0)}%
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

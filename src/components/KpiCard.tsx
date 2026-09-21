import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { pctChange } from "@/lib/format";

export function KpiCard({
  label,
  value,
  raw,
  previous,
  upIsGood = true,
  hint,
  hero = false,
}: {
  label: string;
  value: string;
  raw?: number;
  previous?: number;
  upIsGood?: boolean;
  hint?: string;
  hero?: boolean;
}) {
  const change = raw !== undefined && previous !== undefined ? pctChange(raw, previous) : undefined;
  let tone = "text-ink-3";
  let Icon = Minus;
  if (change !== undefined && change !== null && Math.abs(change) >= 0.0005) {
    const up = change > 0;
    const good = up === upIsGood;
    tone = good ? "text-good-text" : "text-bad-text";
    Icon = up ? ArrowUpRight : ArrowDownRight;
  }
  return (
    <div className={`card min-w-0 p-3 sm:p-4 ${hero ? "col-span-2" : ""}`}>
      <div className="text-xs font-medium leading-snug text-ink-2">{label}</div>
      <div className={`mt-1 truncate font-semibold tracking-tight ${hero ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl xl:text-lg 2xl:text-2xl"}`} title={value}>
        {value}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {change !== undefined && (
          <span className={`inline-flex items-center gap-0.5 ${tone}`}>
            <Icon className="h-3.5 w-3.5" />
            {change === null ? "new" : `${Math.abs(change * 100).toFixed(1)}%`}
          </span>
        )}
        {change !== undefined && <span className="hidden truncate text-ink-3 sm:inline">vs previous</span>}
        {hint && change === undefined && <span className="text-ink-3">{hint}</span>}
      </div>
    </div>
  );
}

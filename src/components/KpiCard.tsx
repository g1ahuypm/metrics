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
  sub,
}: {
  label: string;
  value: string;
  raw?: number;
  previous?: number;
  upIsGood?: boolean;
  hint?: string;
  hero?: boolean;
  sub?: string;
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
    <div className={`card @container min-w-0 p-3 sm:p-4 ${hero ? "col-span-2" : ""}`}>
      <div className="text-xs font-medium leading-snug text-ink-2">{label}</div>
      <div className={`mt-1 truncate font-semibold tracking-tight ${
          hero
            ? "text-2xl @min-[200px]:text-3xl @min-[250px]:text-4xl"
            : "text-base @min-[118px]:text-lg @min-[135px]:text-xl @min-[165px]:text-2xl"
        }`} title={value}>
        {value}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {sub && <span className="mr-1 font-medium text-ink-2">{sub}</span>}
        {change !== undefined && (
          <span className={`inline-flex items-center gap-0.5 ${tone}`}>
            <Icon className="h-3.5 w-3.5" />
            {change === null ? "new" : `${Math.abs(change * 100).toFixed(1)}%`}
          </span>
        )}
        {change !== undefined && <span className="hidden truncate text-ink-3 sm:inline lg:hidden xl:inline">vs previous</span>}
        {hint && change === undefined && <span className="text-ink-3">{hint}</span>}
      </div>
    </div>
  );
}

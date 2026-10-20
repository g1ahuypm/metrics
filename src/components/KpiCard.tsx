import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
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
  icon: Icon0,
  tint = "accent",
  featured = false,
}: {
  label: string;
  value: string;
  raw?: number;
  previous?: number;
  upIsGood?: boolean;
  hint?: string;
  hero?: boolean;
  sub?: string;
  icon?: LucideIcon;
  tint?: "accent" | "orange" | "good";
  /** The one number that matters most: a filled card, teal for a profit, red for a loss. */
  featured?: boolean;
}) {
  const change = raw !== undefined && previous !== undefined ? pctChange(raw, previous) : undefined;
  let tone = "text-ink-3";
  let Icon = Minus;
  if (change !== undefined && change !== null && Math.abs(change) >= 0.0005) {
    const up = change > 0;
    const good = up === upIsGood;
    tone = featured ? "text-white" : good ? "text-good-text" : "text-bad-text";
    Icon = up ? ArrowUpRight : ArrowDownRight;
  }
  const loss = featured && raw !== undefined && raw < 0;
  const chip = featured ? "bg-white/15 text-white" : tint === "orange" ? "bg-orange-soft text-orange-text" : tint === "good" ? "bg-good-soft text-good-text" : "bg-accent-soft text-accent-text";
  const muted = featured ? "text-white/80" : "text-ink-3";
  return (
    <div
      className={`@container min-w-0 rounded-[20px] p-3.5 sm:p-5 ${hero ? "col-span-2" : ""} ${
        featured ? `${loss ? "bg-bad-solid" : "bg-good-solid"} text-white` : "card"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={`text-xs font-semibold leading-snug sm:text-sm ${featured ? "text-white/85" : "text-ink-2"}`}>{label}</div>
        {Icon0 && (
          <span className={`hidden h-8 w-8 shrink-0 place-items-center rounded-[10px] @min-[150px]:grid ${chip}`}>
            <Icon0 className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className={`mt-1.5 truncate font-extrabold tracking-tight ${
          hero
            ? "text-2xl @min-[200px]:text-3xl @min-[250px]:text-4xl"
            : "text-base @min-[118px]:text-lg @min-[135px]:text-xl @min-[165px]:text-2xl"
        }`} title={value}>
        {value}
      </div>
      {sub && <div className={`mt-1 truncate text-xs font-medium ${featured ? "text-white/85" : "text-ink-2"}`} title={sub}>{sub}</div>}
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {change !== undefined && (
          <span className={`inline-flex items-center gap-0.5 ${tone}`}>
            <Icon className="h-3.5 w-3.5" />
            {change === null ? "new" : `${Math.abs(change * 100).toFixed(1)}%`}
          </span>
        )}
        {change !== undefined && <span className={`hidden truncate sm:inline lg:hidden xl:inline ${muted}`}>vs previous</span>}
        {hint && change === undefined && <span className={muted}>{hint}</span>}
      </div>
    </div>
  );
}

import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";

// All bucketing is done on UTC calendar days so Shopify orders and Meta daily
// insights line up regardless of the server's local timezone.

export type DateRange = {
  from: Date; // inclusive, UTC midnight
  to: Date; // inclusive, UTC midnight
  preset: string;
  label: string;
  prevFrom: Date;
  prevTo: Date;
  days: number;
};

export const PRESETS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "14d", label: "Last 14 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "mtd", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "90d", label: "Last 90 days" },
];

export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function todayUtc(): Date {
  return utcDay(new Date());
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseISODate(s: string | undefined | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** End of the given UTC day (23:59:59.999). */
export function endOfUtcDay(d: Date): Date {
  return new Date(utcDay(d).getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function resolveRange(params: { range?: string; from?: string; to?: string }): DateRange {
  const today = todayUtc();
  let from: Date;
  let to: Date;
  let preset = params.range ?? "30d";
  let label = "";

  const customFrom = parseISODate(params.from);
  const customTo = parseISODate(params.to);

  if (customFrom && customTo && customFrom <= customTo) {
    from = customFrom;
    to = customTo;
    preset = "custom";
    label = "Custom";
  } else {
    switch (preset) {
      case "today":
        from = today;
        to = today;
        break;
      case "yesterday":
        from = subDays(today, 1);
        to = subDays(today, 1);
        break;
      case "7d":
        from = subDays(today, 6);
        to = today;
        break;
      case "14d":
        from = subDays(today, 13);
        to = today;
        break;
      case "90d":
        from = subDays(today, 89);
        to = today;
        break;
      case "mtd":
        from = utcDay(startOfMonth(today));
        to = today;
        break;
      case "lastmonth": {
        const lm = subMonths(today, 1);
        from = utcDay(startOfMonth(lm));
        to = utcDay(endOfMonth(lm));
        break;
      }
      case "30d":
      default:
        preset = "30d";
        from = subDays(today, 29);
        to = today;
    }
    label = PRESETS.find((p) => p.key === preset)?.label ?? "Last 30 days";
  }

  const days = differenceInCalendarDays(to, from) + 1;
  const prevTo = subDays(from, 1);
  const prevFrom = subDays(prevTo, days - 1);

  return { from, to, preset, label, prevFrom, prevTo, days };
}

export function eachDay(from: Date, to: Date): string[] {
  const out: string[] = [];
  let cur = utcDay(from);
  const end = utcDay(to);
  while (cur <= end) {
    out.push(toISODate(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

export function daysInUtcMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function rangeToSearch(range: DateRange): string {
  if (range.preset === "custom") return `from=${toISODate(range.from)}&to=${toISODate(range.to)}`;
  return `range=${range.preset}`;
}

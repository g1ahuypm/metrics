import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";

// A day means a calendar day in the STORE's timezone, like Shopify's own reports.
// Calendar dates are carried as UTC-midnight Date objects (2026-10-17T00:00Z means
// "October 17"); order timestamps are mapped onto them with storeDate(), and a
// calendar day is turned back into real instants with dayStart().

export type DateRange = {
  from: Date; // inclusive calendar date (UTC midnight)
  to: Date; // inclusive calendar date (UTC midnight)
  tz: string; // store timezone, e.g. America/New_York
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

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar date ("YYYY-MM-DD") an instant falls on in the given timezone. */
export function storeDate(instant: Date, tz: string): string {
  let f = dateFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormatters.set(tz, f);
  }
  return f.format(instant);
}

/** Today's calendar date in the given timezone. */
export function todayIn(tz: string): Date {
  return new Date(`${storeDate(new Date(), tz)}T00:00:00.000Z`);
}

/** Minutes the timezone is ahead of UTC at that instant (New York in October: -240). */
function offsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** The instant a calendar date (UTC-midnight Date) begins in the given timezone. */
export function dayStart(date: Date, tz: string): Date {
  const guess = utcDay(date).getTime();
  let t = guess - offsetMinutes(new Date(guess), tz) * 60000;
  t = guess - offsetMinutes(new Date(t), tz) * 60000; // settle across a DST change
  return new Date(t);
}

/** The instant a wall-clock time ("2026-10-22", "17:00") happens in the given timezone. */
export function zonedInstant(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMinutes(new Date(guess), tz) * 60000;
  t = guess - offsetMinutes(new Date(t), tz) * 60000; // settle across a DST change
  return new Date(t);
}

/** The hour (0–23) it is right now in the given timezone. */
export function hourIn(instant: Date, tz: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit" }).format(instant);
  return Number(h) % 24;
}

/** The instant just after a calendar date ends in the given timezone (exclusive bound). */
export function dayEnd(date: Date, tz: string): Date {
  return dayStart(addDays(utcDay(date), 1), tz);
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

export function resolveRange(params: { range?: string; from?: string; to?: string }, tz = "UTC"): DateRange {
  const today = todayIn(tz);
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

  return { from, to, tz, preset, label, prevFrom, prevTo, days };
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

export type ViewParams = { range?: string; from?: string; to?: string; product?: string };

/** Query string that preserves the selected date range and product across pages. */
export function viewQuery(sp: ViewParams): string {
  const q = new URLSearchParams();
  if (sp.from && sp.to) {
    q.set("from", sp.from);
    q.set("to", sp.to);
  } else if (sp.range) q.set("range", sp.range);
  if (sp.product) q.set("product", sp.product);
  return q.toString();
}

/** Query string for links that should open with the current range and product. */
export function scopeQuery(range: DateRange, productId?: string): string {
  const q = new URLSearchParams(rangeToSearch(range));
  if (productId) q.set("product", productId);
  return q.toString();
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function fmtMoney(value: number, currency = "USD", opts: { compact?: boolean; decimals?: number } = {}): string {
  const decimals = opts.decimals ?? (opts.compact ? 0 : 2);
  const key = `${currency}-${decimals}-${opts.compact ? "c" : "s"}`;
  let f = currencyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      notation: opts.compact ? "compact" : "standard",
    });
    currencyFormatters.set(key, f);
  }
  return f.format(value);
}

export function fmtNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function fmtPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "–";
  return `${(value * 100).toFixed(decimals)}%`;
}

export function fmtMultiple(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "–";
  return `${value.toFixed(decimals)}x`;
}

export function fmtDate(d: Date | string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(date);
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "never";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous);
}

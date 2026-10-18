export const COST_TYPES = ["MONTHLY", "DAILY", "ONE_TIME", "PERCENT_REVENUE", "PER_ORDER"] as const;
export type CostType = (typeof COST_TYPES)[number];

export const COST_TYPE_LABELS: Record<CostType, string> = {
  MONTHLY: "Per month",
  DAILY: "Per day",
  ONE_TIME: "One-time",
  PERCENT_REVENUE: "% of revenue",
  PER_ORDER: "Per order",
};

export const COST_CATEGORIES = [
  "Software & apps",
  "Team & contractors",
  "Agency & freelancers",
  "Shipping & fulfillment",
  "Content & creative",
  "Other ads",
  "Rent & overhead",
  "Other",
];

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "SGD", "AED", "VND", "JPY", "INR", "BRL", "MXN"];

export const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

/** Destination markets with their own supplier costs. "" is the default for everywhere else. */
export const MARKETS: { code: string; label: string; short: string; currency: string }[] = [
  { code: "US", label: "United States", short: "US", currency: "USD" },
  { code: "CA", label: "Canada", short: "CA", currency: "CAD" },
  { code: "AU", label: "Australia", short: "AU", currency: "AUD" },
  { code: "GB", label: "United Kingdom", short: "UK", currency: "GBP" },
  { code: "NZ", label: "New Zealand", short: "NZ", currency: "NZD" },
];

export function marketLabel(code: string | null | undefined): string {
  if (!code) return "Default";
  return MARKETS.find((m) => m.code === code)?.short ?? code;
}

/** Best-effort country from the currency the customer paid in, when no address is available. */
export function countryFromCurrency(currency: string | null | undefined): string | null {
  if (!currency) return null;
  return MARKETS.find((m) => m.currency === currency.toUpperCase())?.code ?? null;
}

/**
 * Where bank money goes. "business" counts toward the business's cash profit, "owner" is
 * money the owner put in or took out for themselves, "transfer" moves between their own
 * accounts and "unsorted" still needs a decision. The sign of each transaction decides in or out,
 * so a supplier refund simply lowers supplier spending.
 */
export type CashGroup = "business" | "owner" | "transfer" | "unsorted";

export const CASH_CATEGORIES = [
  { key: "SHOPIFY_PAYOUT", label: "Shopify payout", group: "business" },
  { key: "OTHER_INCOME", label: "Other business income", group: "business" },
  { key: "META_ADS", label: "Meta ads", group: "business" },
  { key: "SUPPLIER", label: "Suppliers & products", group: "business" },
  { key: "SHIPPING", label: "Shipping & fulfilment", group: "business" },
  { key: "SHOPIFY_APPS", label: "Shopify bill & apps", group: "business" },
  { key: "SOFTWARE", label: "Other software", group: "business" },
  { key: "TEAM", label: "Team & contractors", group: "business" },
  { key: "BANK_FEES", label: "Bank fees", group: "business" },
  { key: "TAXES", label: "Taxes", group: "business" },
  { key: "OTHER_BUSINESS", label: "Other business cost", group: "business" },
  { key: "OWNER_IN", label: "Money you put in", group: "owner" },
  { key: "PERSONAL", label: "Personal / you took out", group: "owner" },
  { key: "TRANSFER", label: "Between your own accounts", group: "transfer" },
  { key: "UNSORTED", label: "Not sorted yet", group: "unsorted" },
] as const satisfies readonly { key: string; label: string; group: CashGroup }[];

export type CashCategory = (typeof CASH_CATEGORIES)[number]["key"];

const BY_KEY = new Map<string, (typeof CASH_CATEGORIES)[number]>(CASH_CATEGORIES.map((c) => [c.key, c]));

export function categoryLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function categoryGroup(key: string): CashGroup {
  return BY_KEY.get(key)?.group ?? "unsorted";
}

export function isCategory(key: string): key is CashCategory {
  return BY_KEY.has(key);
}

/** Plaid's own guess, in words, shown next to unsorted lines as a hint. */
export function plaidHint(detailed: string | null | undefined): string | null {
  if (!detailed) return null;
  const words = detailed.toLowerCase().split("_");
  return words.join(" ").replace(/^./, (c) => c.toUpperCase());
}

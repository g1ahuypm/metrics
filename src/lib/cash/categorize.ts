import type { CashCategory } from "./categories";

export type RuleLike = { match: string; direction: string; category: string; storeId: string | null };
export type TxLike = { name: string; merchantName: string | null; amount: number; plaidCategory: string | null };

/** The text a rule is matched against: the merchant Plaid recognised, then the bank's description. */
export function matchText(tx: Pick<TxLike, "name" | "merchantName">): string {
  return `${tx.merchantName ?? ""} ${tx.name}`.toLowerCase();
}

/** What a rule made from this transaction would look for: the merchant, or the description without numbers. */
export function ruleMatchFor(tx: Pick<TxLike, "name" | "merchantName">): string {
  const base = (tx.merchantName?.trim() || tx.name).toLowerCase();
  return base.replace(/[#*]?\d[\d\-/.:]*/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || base.slice(0, 60);
}

/**
 * Sorts a bank line. The owner's own rules come first; then only the cases that are
 * unambiguous: Shopify money in is a payout, Shopify money out is the Shopify bill,
 * Facebook/Meta charges are ads, and Plaid's "bank fees".
 * Everything else waits for the owner, because the account also holds personal spending.
 */
export function categorize(tx: TxLike, rules: RuleLike[]): { category: CashCategory | string; source: "rule" | "auto"; storeId: string | null } {
  const text = matchText(tx);
  const dir = tx.amount > 0 ? "in" : "out";
  // Longest match wins, so "shopify capital" beats "shopify".
  const rule = rules
    .filter((r) => r.match && text.includes(r.match) && (r.direction === "any" || r.direction === dir))
    .sort((a, b) => b.match.length - a.match.length)[0];
  if (rule) return { category: rule.category, source: "rule", storeId: rule.storeId };

  const auto = (category: CashCategory) => ({ category, source: "auto" as const, storeId: null });
  if (/shopify/.test(text)) return auto(tx.amount > 0 ? "SHOPIFY_PAYOUT" : "SHOPIFY_APPS");
  if (tx.amount < 0 && /(facebk|facebook|meta ads|meta platforms|fb\.me)/.test(text)) return auto("META_ADS");
  const pc = tx.plaidCategory ?? "";
  // Plaid's "account transfer" becomes "between your own accounts" only once its other half is
  // found in another counted account (matchTransfers); until then it waits for the owner.
  if (pc.startsWith("BANK_FEES")) return auto("BANK_FEES");
  return auto("UNSORTED");
}

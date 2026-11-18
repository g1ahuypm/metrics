// The confirmation email after a refund, filled in from Shopify's refund record so the amount,
// order and items are always exact. It becomes a draft in Support; a person checks it and sends it.
// Shape (the owner's approved example, Nov 18): apology first, the exact refund, the next step, their
// other concern (optional store paragraph), then the store's warm close.

export type ReturnChoice = "needed" | "not_needed" | "received";

export const RETURN_CHOICES: { value: ReturnChoice; label: string }[] = [
  { value: "needed", label: "They send the items back (we email return instructions within 2–3 business days)" },
  { value: "not_needed", label: "They keep the items (no return)" },
  { value: "received", label: "We already have the items back" },
];

export type EmailOptions = { choice: ReturnChoice; apology: boolean; extra: boolean };

/** The store's own wording. */
export type StoreWording = { closing: string | null; extra: string | null; itemsWord: string | null };

/** The last paragraph when a store has none of its own. */
export const DEFAULT_CLOSING = "Thank you for your patience, and please don't hesitate to reach out if there's anything else we can help with.";
export const APOLOGY = "I'm sorry for the frustration and the time it has taken to resolve this.";

/** LearnWell's wording, as approved by the owner (Nov 18, 2026). */
export const LEARNWELL_CLOSING =
  "The book is now available in hardcover. Should you ever wish to shop with us again, you're welcome to use HONEY15 for a discount on a future order.";
export const LEARNWELL_EXTRA =
  "I also understand you expected hardcover books. Our earlier website listing described the paperback edition, and I'm sorry for the disappointment over the format.";
/** The first LearnWell closing (Nov 18 morning), replaced by the approved one above when it was never edited. */
export const LEARNWELL_CLOSING_V1 =
  "I'm sorry this purchase didn't meet your expectations. If you'd like to shop with us again, the book is now available in hardcover, and you can use HONEY15 for a discount on a future order.";

const NUMBER_WORDS = ["", "the", "both", "all three", "all four", "all five"];

export function fmtRefundAmount(amount: number, currency: string): string {
  const n = amount.toFixed(2);
  return currency === "USD" ? `$${n} USD` : `${n} ${currency}`;
}

/** "2× Winnie the Pooh…" → "both copies in that order"; mixed items are named. */
export function coveredItems(items: string | null, full: boolean, books = true): string | null {
  if (!items) return null;
  const parts = items.split(/,\s(?=\d+×\s)/).map((p) => p.match(/^(\d+)×\s(.+)$/)).filter((m): m is RegExpMatchArray => Boolean(m));
  if (!parts.length) return null;
  if (parts.length === 1) {
    const q = Number(parts[0][1]);
    const [one, many] = books ? ["copy", "copies"] : ["item", "items"];
    if (full && q < NUMBER_WORDS.length) return `${NUMBER_WORDS[q]} ${q === 1 ? one : many} in that order`;
    return q === 1 ? `one ${one} of ${parts[0][2]}` : `${q} ${many} of ${parts[0][2]}`;
  }
  const named = parts.map((m) => (m[1] === "1" ? m[2] : `${m[2]} (×${m[1]})`));
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

export function refundEmail(
  r: { customerName: string | null; orderName: string; amount: number; currency: string; full: boolean; items: string | null; status: string },
  o: EmailOptions,
  w: StoreWording,
): string {
  const first = (r.customerName ?? "").trim().split(/\s+/)[0];
  const covered = coveredItems(r.items, r.full, /book/i.test(w.itemsWord ?? ""));
  const kind = r.full ? "full" : "partial";
  const what = `a ${kind} refund of ${fmtRefundAmount(r.amount, r.currency)} for order ${r.orderName} to your original payment method${covered ? `, covering ${covered}` : ""}.`;
  // Only Shopify saying "processed" lets us say processed; otherwise it has been started.
  const refund =
    r.status === "processed"
      ? `We've processed ${what} Your bank may take some time to display the credit.`
      : `We've started ${what} It's being processed now, and your bank may take some time to display the credit.`;
  const noun = (w.itemsWord ?? "").trim() || "items";
  const ret =
    o.choice === "needed"
      ? `We'll email you return instructions within 2–3 business days. Please wait for those instructions before sending any ${noun} back.`
      : o.choice === "received"
        ? `We've received the ${noun} you sent back, so there's nothing more you need to do.`
        : `There's no need to send the ${noun} back.`;
  return [
    `Hi${first ? ` ${first}` : ""},`,
    ...(o.apology ? [APOLOGY] : []),
    refund,
    ret,
    ...(o.extra && w.extra?.trim() ? [w.extra.trim()] : []),
    (w.closing ?? "").trim() || DEFAULT_CLOSING,
  ].join("\n\n");
}

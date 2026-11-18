// The confirmation email after a refund, filled in from Shopify's refund record so the amount,
// order and items are always exact. It becomes a draft in Support; a person checks it and sends it.

export type ReturnChoice = "needed" | "not_needed" | "received";

export const RETURN_CHOICES: { value: ReturnChoice; label: string }[] = [
  { value: "needed", label: "They send the items back (we email return instructions within 2–3 business days)" },
  { value: "not_needed", label: "They keep the items (no return)" },
  { value: "received", label: "We already have the items back" },
];

/** The last paragraph when a store has none of its own. */
export const DEFAULT_CLOSING = "I'm sorry this purchase didn't meet your expectations.";

/** LearnWell's last paragraph, as the owner wrote it (Nov 2026). */
export const LEARNWELL_CLOSING =
  "I'm sorry this purchase didn't meet your expectations. If you'd like to shop with us again, the book is now available in hardcover, and you can use HONEY15 for a discount on a future order.";

export function fmtRefundAmount(amount: number, currency: string): string {
  const n = amount.toFixed(2);
  return currency === "USD" ? `$${n} USD` : `${n} ${currency}`;
}

/** "2× Winnie the Pooh…, 1× Puzzle Packet" → "Winnie the Pooh… (×2) and Puzzle Packet". */
export function itemsInWords(items: string | null): string | null {
  if (!items) return null;
  const parts = items.split(/,\s(?=\d+×\s)/).map((p) => {
    const m = p.match(/^(\d+)×\s(.+)$/);
    if (!m) return p;
    return m[1] === "1" ? m[2] : `${m[2]} (×${m[1]})`;
  });
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
}

export function refundEmail(
  r: { customerName: string | null; orderName: string; amount: number; currency: string; full: boolean; items: string | null },
  choice: ReturnChoice,
  closing: string | null,
): string {
  const first = (r.customerName ?? "").trim().split(/\s+/)[0];
  const items = itemsInWords(r.items);
  const lines = [
    `Hi${first ? ` ${first}` : ""},`,
    `We've processed a ${r.full ? "full" : "partial"} refund of ${fmtRefundAmount(r.amount, r.currency)}${items ? ` for ${items} in order ${r.orderName}` : ` for order ${r.orderName}`} to your original payment method. Your bank may take some time to display the credit.`,
    choice === "needed"
      ? "We'll email you return instructions within 2–3 business days. Please wait for those instructions before sending anything back."
      : choice === "received"
        ? "We've received the items you sent back, so there's nothing more you need to do."
        : "There's no need to send anything back.",
    (closing ?? "").trim() || DEFAULT_CLOSING,
  ];
  return lines.join("\n\n");
}

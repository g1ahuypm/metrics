import "server-only";
import { db } from "../db";

/**
 * The starting knowledge base, written from LearnWell's published Refund and
 * Shipping policies. Each article tells the AI when it applies, the facts it may
 * state, and the shape of the reply. The owner edits them on the Knowledge base page.
 */
export const DEFAULT_ARTICLES = [
  {
    key: "order_status",
    title: "Where is my order / tracking",
    whenToUse: "The customer asks where their order is, when it ships, or for a tracking number.",
    answer: `Use the customer's order details provided to you.
- Shipped (has tracking): give the carrier, the tracking number and the tracking link, and the date it shipped. Delivery usually takes 7–15 business days after shipping depending on the country and customs.
- Not shipped yet: orders are processed within 1–3 business days (Monday–Friday, excluding holidays). They will get an email with tracking as soon as it ships.
- No order found under their email: ask for their order number (it starts with #LW) and the email address used at checkout.
Never guess a date or a tracking number.`,
    autoSend: true,
    flagForTeam: false,
  },
  {
    key: "delivery_time",
    title: "How long delivery takes / shipping countries / customs",
    whenToUse: "Questions before or after buying about delivery times, which countries we ship to, or customs fees.",
    answer: `- We ship worldwide.
- Processing: 1–3 business days. Delivery: usually 7–15 business days after shipping, depending on the destination and customs.
- Tracking is emailed as soon as the order ships.
- International orders may be charged customs duties, taxes or import fees on arrival. These are paid by the customer and are not included in the order total.`,
    autoSend: true,
    flagForTeam: false,
  },
  {
    key: "late_or_lost",
    title: "Package late, lost, or marked delivered but not received",
    whenToUse: "The order is past the estimated delivery time, tracking hasn't moved, or it shows delivered but they don't have it.",
    answer: `- Apologise for the wait and show you take it seriously.
- If tracking shows it is still moving, share the latest status and the tracking link; customs can add several days.
- Tell them our team is opening an investigation with the carrier and will update them within 2 business days.
- If marked delivered: ask them to check with neighbours, building reception and their mailbox, and to confirm the shipping address.
Do not promise a refund or a replacement; the team decides after the carrier investigation.`,
    autoSend: true,
    flagForTeam: true,
  },
  {
    key: "refund_return",
    title: "Refunds and returns",
    whenToUse: "The customer wants to return a book or asks for a refund for a reason other than damage or a wrong item.",
    answer: `Policy:
- Returns are accepted within 30 days of delivery. Books must be unused: unread, unmarked, in their original packaging.
- Not returnable: digital products and downloads, final-sale items, books that have been written in, highlighted or damaged by the customer.
- Once the return is received and inspected, an approved refund goes back to the original payment method within 5–10 business days. Shipping costs are not refundable.
- We don't do direct exchanges: return the item and place a new order.
Reply: confirm we received the request. If the order number, the items, or the reason is missing, ask for it. Tell them our team will email return instructions within 2 business days.
Do not say the refund is approved and do not promise any amount.`,
    autoSend: true,
    flagForTeam: true,
  },
  {
    key: "damaged_wrong",
    title: "Damaged or wrong item",
    whenToUse: "The book arrived damaged, or they received the wrong item.",
    answer: `- Apologise sincerely.
- Ask for a photo of the damage or of the item received, if they haven't sent one.
- Policy: if contacted within 7 days of delivery, we send a replacement or issue a full refund at no cost to them.
- Tell them our team will confirm the replacement or refund within 2 business days.`,
    autoSend: true,
    flagForTeam: true,
  },
  {
    key: "cancel_change",
    title: "Cancel an order or change the shipping address",
    whenToUse: "The customer wants to cancel, or to correct the shipping address or another detail on their order.",
    answer: `- If the order has already shipped, it can no longer be changed or cancelled; explain they can return it within 30 days of delivery under the return policy.
- If it has not shipped yet: thank them for reaching out quickly, confirm the change they asked for (repeat the new address back to them), and say our team will make the change and confirm by email.
- Never confirm that the change has already been made.`,
    autoSend: true,
    flagForTeam: true,
  },
  {
    key: "offer",
    title: "The offer, bundle and free gift",
    whenToUse: "Questions about prices, the Buy 1 / Buy 2 offer, discounts, or the free Hundred Acre Wood Puzzle Packet.",
    answer: `- Winnie the Pooh: The Complete Stories and Poems is offered as Buy 1 or Buy 2.
- Buy 2 includes The Hundred Acre Wood Puzzle Packet as a free gift, added automatically at checkout.
- The current prices and discounts are shown on the product page and applied automatically at checkout; no code is needed.
Do not quote a price or a discount that isn't stated here.`,
    autoSend: true,
    flagForTeam: false,
  },
  {
    key: "product_question",
    title: "Questions about a book",
    whenToUse: "Questions about a book's contents, format, size, age range or suitability.",
    answer: `Owner: add the facts customers ask about here (format, page count, age range, condition). Until then a person answers these.`,
    autoSend: false,
    flagForTeam: false,
  },
  {
    key: "payment",
    title: "Payment problems or unexpected charges",
    whenToUse: "Declined payments, double charges, charges they don't recognise, or billing questions.",
    answer: `- Thank them and say our team is looking into the charge and will reply within 1–2 business days.
- Ask for the order number and the last 4 digits of the card if they haven't given them. Never ask for a full card number.`,
    autoSend: false,
    flagForTeam: true,
  },
];

/** Adds the starting articles the first time support is used. Never overwrites edits. */
export async function ensureKnowledgeBase(): Promise<void> {
  if ((await db.kbArticle.count()) > 0) return;
  await db.kbArticle.createMany({ data: DEFAULT_ARTICLES.map((a, i) => ({ ...a, sortOrder: i })), skipDuplicates: true });
}

export const DEFAULT_SIGNATURE = `Warm regards,

The LearnWell Customer Care Team
LearnWell Co · trylearnwell.com
Monday–Friday, 9:00 AM – 5:00 PM EST`;

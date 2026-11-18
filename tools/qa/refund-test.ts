// Refund grouping and the refund email, against shapes copied from real Shopify orders (names removed).
// Run from the repo root with a temporary node_modules/server-only stub (see README):
//   npx tsx --tsconfig tsconfig.json tools/qa/refund-test.ts
import assert from "node:assert/strict";
import { refundEvents, sameOrder, type RefundOrderNode } from "../../src/lib/refunds/sync";
import { refundEmail, LEARNWELL_CLOSING } from "../../src/lib/refunds/email";

const m = (amount: string) => ({ shopMoney: { amount, currencyCode: "USD" } });
const tx = (id: string, kind: string, status: string, createdAt: string, amount: string) => ({ id, kind, status, createdAt, amountSet: m(amount) });
const POOH = "Winnie the Pooh: The Complete Stories and Poems";
const li = (n: number) => Array.from({ length: n }, () => ({ quantity: 1, lineItem: { title: POOH } }));

// Like #LW001473 today: two pending refund transactions (one per charge), items on the refund record.
const pendingTwoCharges: RefundOrderNode = {
  id: "o1", name: "#LW001473", displayFinancialStatus: "PAID", totalPriceSet: m("124.98"),
  transactions: [tx("t1", "CAPTURE", "SUCCESS", "2026-10-28T23:40:46Z", "59.99"), tx("t2", "SALE", "SUCCESS", "2026-10-28T23:41:04Z", "64.99"),
    tx("t3", "REFUND", "PENDING", "2026-11-18T05:05:28Z", "59.99"), tx("t4", "REFUND", "PENDING", "2026-11-18T05:05:28Z", "64.99")],
  refunds: [{ id: "r1", createdAt: "2026-11-18T05:05:29Z", note: "", refundLineItems: { nodes: li(2) } }],
};
let e = refundEvents(pendingTwoCharges);
assert.equal(e.length, 1);
assert.deepEqual([e[0].amount, e[0].status, e[0].full, e[0].items], [124.98, "pending", true, `2× ${POOH}`]);

// Like #LW001424: items restocked on Oct 27 ($0), money refunded Nov 4 in three transactions; one book kept.
const laterMoney: RefundOrderNode = {
  id: "o2", name: "#LW001424", displayFinancialStatus: "REFUNDED", totalPriceSet: m("249.96"),
  transactions: [tx("a", "REFUND", "SUCCESS", "2026-11-04T19:30:29Z", "59.99"), tx("b", "REFUND", "SUCCESS", "2026-11-04T19:30:31Z", "59.99"), tx("c", "REFUND", "SUCCESS", "2026-11-04T19:30:34Z", "64.99")],
  refunds: [{ id: "x", createdAt: "2026-10-27T23:09:07Z", note: null, refundLineItems: { nodes: li(2) } },
    { id: "y", createdAt: "2026-11-04T19:30:29Z", note: null, refundLineItems: { nodes: [] } }],
};
e = refundEvents(laterMoney);
assert.equal(e.length, 1);
assert.deepEqual([e[0].amount, e[0].status, e[0].full, e[0].items], [184.97, "processed", false, null]);

// Like #LW001335: one partial refund with a note.
const partial: RefundOrderNode = {
  id: "o3", name: "#LW001335", displayFinancialStatus: "PARTIALLY_REFUNDED", totalPriceSet: m("184.97"),
  transactions: [tx("p", "REFUND", "SUCCESS", "2026-10-23T01:28:25Z", "119.98")],
  refunds: [{ id: "z", createdAt: "2026-10-23T01:28:25Z", note: "Accidentally ordered 3. ", refundLineItems: { nodes: li(2) } }],
};
e = refundEvents(partial);
assert.deepEqual([e[0].amount, e[0].full, e[0].items, e[0].note], [119.98, false, `2× ${POOH}`, "Accidentally ordered 3."]);

// Two refunds on different days stay separate; a failed one is "failed".
const twoDays: RefundOrderNode = {
  id: "o4", name: "#LW1", displayFinancialStatus: "PARTIALLY_REFUNDED", totalPriceSet: m("100"),
  transactions: [tx("d1", "REFUND", "SUCCESS", "2026-11-01T10:00:00Z", "10"), tx("d2", "REFUND", "FAILURE", "2026-11-03T10:00:00Z", "20")],
  refunds: [],
};
e = refundEvents(twoDays);
assert.deepEqual(e.map((x) => [x.amount, x.status]), [[10, "processed"], [20, "failed"]]);

assert.ok(sameOrder("#LW001473", "lw1473") && sameOrder("1473", "#LW001473") && !sameOrder("#LW001473", "#LW001474"));

const r = { customerName: "Judith King", orderName: "#LW001473", amount: 124.98, currency: "USD", full: true, items: `2× ${POOH}` };
const out: Record<string, string> = {
  "Confirmed refund, return required": refundEmail(r, "needed", LEARNWELL_CLOSING),
  "Return waived": refundEmail(r, "not_needed", LEARNWELL_CLOSING),
  "Return already completed": refundEmail(r, "received", LEARNWELL_CLOSING),
  "Partial refund, no items recorded": refundEmail({ ...r, amount: 64.99, full: false, items: null }, "not_needed", LEARNWELL_CLOSING),
};
assert.match(out["Confirmed refund, return required"], /full refund of \$124\.98 USD for Winnie the Pooh: The Complete Stories and Poems \(×2\) in order #LW001473/);
assert.match(out["Confirmed refund, return required"], /within 2–3 business days/);
assert.match(out["Confirmed refund, return required"], /HONEY15/);
assert.match(out["Confirmed refund, return required"], /hardcover/);
assert.doesNotMatch(out["Return waived"], /return instructions/);
assert.doesNotMatch(out["Return already completed"], /return instructions/);
assert.match(out["Partial refund, no items recorded"], /partial refund of \$64\.99 USD for order #LW001473 to/);
for (const [k, v] of Object.entries(out)) console.log(`--- ${k}\n${v}\n`);
console.log("refund tests passed");

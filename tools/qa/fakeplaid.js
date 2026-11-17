// A stand-in for Plaid's API (same paths, request and response shapes, Plaid's sign: positive = money out).
// State lives in /tmp/.../fakeplaid-state.json so a test can switch scenarios: { phase: 1 | 2, loginRequired }.
const http = require("http");
const fs = require("fs");
const path = require("path");
const STATE = path.join(__dirname, "fakeplaid-state.json");
const state = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { phase: 1 });
const log = [];

const CHECKING = "acc_checking_4821";
const SAVINGS = "acc_savings_9930";

/** Phase 1: 90 days of history. Phase 2 adds, changes and removes lines like a real next sync. */
function transactions(phase) {
  const t = [];
  const add = (id, date, amount, name, extra = {}) => t.push({ transaction_id: id, account_id: CHECKING, amount, date, name, merchant_name: null, pending: false, personal_finance_category: null, pending_transaction_id: null, ...extra });
  // Shopify payouts (money in) – amounts and dates must match the payouts seeded in the database.
  for (const p of require("./fakepayouts.json")) add(`tx_payout_${p.id}`, p.bankDate, -p.net, "SHOPIFY TRANSFER ST-" + p.id.slice(-6), { personal_finance_category: { primary: "TRANSFER_IN", detailed: "TRANSFER_IN_DEPOSIT" } });
  // Meta ads (out)
  ["2026-08-12", "2026-08-26", "2026-09-09", "2026-09-23", "2026-10-07", "2026-10-21"].forEach((d, i) => add(`tx_meta_${i}`, d, 750 + i * 25.5, `FACEBK *${7000 + i}ADS`, { merchant_name: "Facebook", personal_finance_category: { primary: "GENERAL_SERVICES", detailed: "GENERAL_SERVICES_ADVERTISING" } }));
  // Supplier (out) – Plaid only knows it's a wire
  ["2026-08-15", "2026-09-15", "2026-10-15"].forEach((d, i) => add(`tx_sup_${i}`, d, 1820.4 + i * 100, `WIRE OUT SHENZHEN BOOKPRINT CO REF${4410 + i}`, { personal_finance_category: { primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_WIRE" } }));
  // Shopify bill (out)
  ["2026-08-20", "2026-09-20", "2026-10-20"].forEach((d, i) => add(`tx_bill_${i}`, d, 39 + 12.5, `SHOPIFY* 21840${i} SHOPIFY.COM`, { merchant_name: "Shopify" }));
  // Personal spending (out)
  ["2026-08-10", "2026-08-24", "2026-09-07", "2026-09-21", "2026-10-05", "2026-10-19", "2026-11-02"].forEach((d, i) => add(`tx_food_${i}`, d, 42.75 + i, `CHIPOTLE ${1000 + i} BOSTON MA`, { merchant_name: "Chipotle", personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_FAST_FOOD" } }));
  // The owner puts money in once
  add("tx_owner_in", "2026-08-05", -5000, "ONLINE TRANSFER FROM CHK ...7712", { personal_finance_category: { primary: "TRANSFER_IN", detailed: "TRANSFER_IN_ACCOUNT_TRANSFER" } });
  // Bank fee
  add("tx_fee", "2026-09-30", 15, "MONTHLY MAINTENANCE FEE", { personal_finance_category: { primary: "BANK_FEES", detailed: "BANK_FEES_OTHER_BANK_FEES" } });
  // Pending card charge
  add("tx_pending_1", "2026-11-03", 64.2, "CHIPOTLE 2001 BOSTON MA", { merchant_name: "Chipotle", pending: true, personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_FAST_FOOD" } });
  // Savings: one interest line
  t.push({ transaction_id: "tx_interest", account_id: SAVINGS, amount: -3.12, date: "2026-10-31", name: "INTEREST PAYMENT", merchant_name: null, pending: false, personal_finance_category: { primary: "INCOME", detailed: "INCOME_INTEREST_EARNED" }, pending_transaction_id: null });
  return t;
}

function balances(phase) {
  return phase === 1 ? { checking: 18234.56, savings: 2503.12 } : { checking: 18100.36, savings: 2503.12 };
}

const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      const s = state();
      log.push({ path: req.url, body: { ...body, secret: body.secret ? "***" : undefined } });
      fs.writeFileSync(path.join(__dirname, "fakeplaid-log.json"), JSON.stringify(log, null, 1));
      if (body.client_id !== "test-client" || body.secret !== "test-secret") return json(res, 400, { error_code: "INVALID_API_KEYS", error_message: "invalid client_id or secret provided" });
      if (s.loginRequired && body.access_token) return json(res, 400, { error_code: "ITEM_LOGIN_REQUIRED", error_message: "the login details of this item have changed", display_message: "Your bank needs you to log in again." });
      const b = balances(s.phase);
      switch (req.url) {
        case "/link/token/create":
          return json(res, 200, { link_token: body.access_token ? "link-update-token" : "link-test-token", expiration: "2026-12-01T00:00:00Z" });
        case "/item/public_token/exchange":
          return json(res, 200, { access_token: "access-test-secret-token", item_id: "item_citizens_1" });
        case "/accounts/get":
          return json(res, 200, {
            accounts: [
              { account_id: CHECKING, name: "Checking", official_name: "Citizens Business Checking", mask: "4821", type: "depository", subtype: "checking", balances: { current: b.checking, available: b.checking - 64.2, iso_currency_code: "USD" } },
              { account_id: SAVINGS, name: "Savings", official_name: "Citizens Savings", mask: "9930", type: "depository", subtype: "savings", balances: { current: b.savings, available: b.savings, iso_currency_code: "USD" } },
            ],
            item: { item_id: "item_citizens_1", institution_id: "ins_citizens" },
          });
        case "/transactions/sync": {
          const all = transactions(s.phase);
          if (!body.cursor) {
            // First pull in two pages, like Plaid does for long histories.
            const half = Math.ceil(all.length / 2);
            return json(res, 200, { added: all.slice(0, half), modified: [], removed: [], next_cursor: "c-half", has_more: true, transactions_update_status: "HISTORICAL_UPDATE_COMPLETE" });
          }
          if (body.cursor === "c-half") {
            const half = Math.ceil(all.length / 2);
            return json(res, 200, { added: all.slice(half), modified: [], removed: [], next_cursor: "c-1", has_more: false, transactions_update_status: "HISTORICAL_UPDATE_COMPLETE" });
          }
          if (body.cursor === "c-1" && s.phase === 2) {
            // The pending Chipotle charge posts (new id, points at the pending one), a fee is reversed (removed),
            // and the October supplier wire is corrected.
            return json(res, 200, {
              added: [{ transaction_id: "tx_posted_1", account_id: CHECKING, amount: 64.2, date: "2026-11-04", name: "CHIPOTLE 2001 BOSTON MA", merchant_name: "Chipotle", pending: false, pending_transaction_id: "tx_pending_1", personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_FAST_FOOD" } }],
              modified: [{ ...all.find((x) => x.transaction_id === "tx_sup_2"), amount: 2000.4 }],
              removed: [{ transaction_id: "tx_pending_1" }, { transaction_id: "tx_fee" }],
              next_cursor: "c-2",
              has_more: false,
              transactions_update_status: "HISTORICAL_UPDATE_COMPLETE",
            });
          }
          return json(res, 200, { added: [], modified: [], removed: [], next_cursor: body.cursor, has_more: false, transactions_update_status: "HISTORICAL_UPDATE_COMPLETE" });
        }
        case "/item/remove":
          return json(res, 200, { request_id: "x" });
        default:
          return json(res, 404, { error_code: "NOT_FOUND", error_message: req.url });
      }
    });
  })
  .listen(7777, () => console.log("fake plaid on 7777"));

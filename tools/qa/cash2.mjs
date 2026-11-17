// End-to-end Cash test against the Plaid stand-in. Expected numbers are computed here from the raw
// stand-in data, independently of the app's code, and compared with what the page shows.
import { chromium } from "playwright";
import fs from "fs";
const DIR = process.env.QA_OUT ?? "/tmp/margin-qa"; // screenshots and page text go here
fs.mkdirSync(`${DIR}/screens`, { recursive: true }); fs.mkdirSync(`${DIR}/perf`, { recursive: true });
const base = "http://localhost:3000";
const RANGE = "from=2026-08-01&to=2026-11-04";
const phase = Number(process.argv[2] ?? 1);
const step = process.argv[3] ?? "connect";

const plaid = async (path, body) => (await fetch("http://127.0.0.1:7777" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: "test-client", secret: "test-secret", ...body }) })).json();
const p1 = await plaid("/transactions/sync", { access_token: "a" });
const p2 = await plaid("/transactions/sync", { access_token: "a", cursor: "c-half" });
let raw = [...p1.added, ...p2.added];
if (phase === 2) {
  const d = await plaid("/transactions/sync", { access_token: "a", cursor: "c-1" });
  const gone = new Set(d.removed.map((r) => r.transaction_id));
  raw = raw.filter((t) => !gone.has(t.transaction_id)).map((t) => d.modified.find((m) => m.transaction_id === t.transaction_id) ?? t);
  raw.push(...d.added);
}
const acc = await plaid("/accounts/get", { access_token: "a" });
const money = (n) => Math.round(n * 100) / 100;
const posted = raw.filter((t) => !t.pending).map((t) => ({ ...t, amt: -t.amount }));
const balance = money(acc.accounts.reduce((s, a) => s + a.balances.current, 0));
const sum = (f) => money(posted.filter(f).reduce((s, t) => s + t.amt, 0));
const isPayout = (t) => /SHOPIFY TRANSFER/.test(t.name);
const isMeta = (t) => /FACEBK/.test(t.name);
const isBill = (t) => /SHOPIFY\*/.test(t.name);
const isSup = (t) => /BOOKPRINT/.test(t.name);
const isFood = (t) => /CHIPOTLE/.test(t.name);
const isOwner = (t) => t.transaction_id === "tx_owner_in";
const isFee = (t) => /MAINTENANCE FEE/.test(t.name);
const isInterest = (t) => /INTEREST/.test(t.name);
const sorted = !["connect", "view"].includes(step); // after the owner sorted the lines
const expect = {
  balance,
  opening: money(balance - sum(() => true)),
  business: sorted ? sum((t) => isPayout(t) || isMeta(t) || isBill(t) || isFee(t) || isSup(t) || isInterest(t)) : sum((t) => isPayout(t) || isMeta(t) || isBill(t) || isFee(t)),
  owner: sorted ? sum((t) => isOwner(t) || isFood(t)) : 0,
  transfer: sorted ? 0 : sum(isOwner),
  unsorted: sorted ? 0 : sum((t) => isSup(t) || isFood(t) || isInterest(t)),
  moneyIn: sum((t) => t.amt > 0 && (sorted || !isOwner(t))),
  moneyOut: money(-sum((t) => t.amt < 0)),
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, deviceScaleFactor: 1.5 });
// Plaid's real window can't load here: a stand-in "Link" that logs in to Citizens straight away.
await ctx.route("https://cdn.plaid.com/**", (r) =>
  r.fulfill({ contentType: "application/javascript", body: `window.Plaid={create(o){return{open(){setTimeout(()=>o.onSuccess("public-test-token",{institution:{name:"Citizens"}}),300)},destroy(){}}}};` }),
);
const p = await ctx.newPage();
await p.goto(base + "/login");
await p.fill('input[name="email"]', "owner@example.com");
await p.fill('input[name="password"]', "password123");
await Promise.all([p.waitForURL(/dashboard/), p.click('button[type="submit"]')]);
await p.goto(`${base}/cash?${RANGE}`);

if (step === "connect") {
  await p.getByRole("button", { name: "Connect your bank" }).click();
  const t0 = Date.now();
  await p.getByText("Is it profit?").waitFor({ timeout: 30000 }).catch(async () => {
    await p.screenshot({ path: `${DIR}/screens/cash-connect-stuck.png` });
    console.log("after connect the page shows:", (await p.locator("main").innerText()).slice(0, 500));
    process.exit(1);
  });
  console.log("connect → numbers on screen in", Date.now() - t0, "ms");
}
if (step === "sort") {
  const row = (text) => p.locator("tr", { hasText: text }).first();
  const pick = async (text, label, always) => {
    await row(text).getByLabel("Category").selectOption({ label });
    await p.waitForTimeout(1500);
    if (always) {
      await row(text).getByRole("button", { name: /Always do this/ }).click();
      await p.waitForTimeout(2000);
    }
  };
  await pick("REF4412", "Suppliers & products", true);
  await pick("CHIPOTLE 1006", "Personal / you took out", true);
  await pick("FROM CHK", "Money you put in", false);
  await pick("INTEREST PAYMENT", "Other business income", false);
  await p.reload();
}
if (step === "refresh") {
  await p.getByRole("button", { name: "Refresh" }).click();
  await p.waitForTimeout(4000);
  await p.reload();
}

await p.getByText("Is it profit?").waitFor({ timeout: 30000 });
await p.waitForTimeout(500);
const text = await p.locator("main").innerText();
fs.writeFileSync(`${DIR}/perf/cash-page-${step}.txt`, text);
const num = (s) => (s ? money(Number(s.replace(/[^0-9.\-−+]/g, "").replace("−", "-").replace("+", ""))) : NaN);
const after = (label) => {
  const i = text.indexOf(label);
  if (i < 0) return NaN;
  const m = text.slice(i + label.length).match(/[−+]?\$[\d,]+\.\d\d/);
  return m ? num(m[0]) : NaN;
};
const got = {
  balance: after("In your bank now\n"),
  opening: after("Your money before the history starts"),
  business: after("Payouts and other business income, minus everything the business paid"),
  owner: after("Money you put in, minus personal spending and what you took out"),
  transfer: text.includes("Between your own accounts\nMoved") ? after("Moved to or from an account that isn't counted here") : 0,
  unsorted: text.includes("Sort these lines below") ? after("Sort these lines below to make the split exact") : 0,
  moneyIn: after("Money in\n"),
  moneyOut: after("Money out\n"),
};
let bad = 0;
for (const k of Object.keys(expect)) {
  const ok = Math.abs(got[k] - expect[k]) < 0.005;
  if (!ok) bad++;
  console.log(`${ok ? "OK " : "BAD"} ${k.padEnd(9)} page ${String(got[k]).padStart(10)}  expected ${String(expect[k]).padStart(10)}`);
}
const parts = money(got.opening + got.business + got.owner + got.transfer + got.unsorted);
console.log(`${Math.abs(parts - got.balance) < 0.005 ? "OK " : "BAD"} parts add up: ${parts} = balance ${got.balance}`);
console.log("payout lines matched to a payout:", (text.match(/Shopify payout of/g) || []).length, "of", posted.filter(isPayout).length);
console.log("pending note:", (text.match(/\d+ pending \([^)]*\)/) || ["none"])[0]);
console.log("still with Shopify:", text.slice(text.indexOf("Money still with Shopify"), text.indexOf("Why bank money")).replace(/\n+/g, " | ").slice(0, 400));
await p.screenshot({ path: `${DIR}/screens/cash-${step}.png`, fullPage: true });
console.log(bad ? `${bad} WRONG` : "all numbers match");
await b.close();

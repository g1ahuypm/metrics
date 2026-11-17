import { chromium } from "playwright";
const base = process.argv[2];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: 4e6 / 8, uploadThroughput: 3e6 / 8 });
await p.goto(base + "/login");
await p.fill('input[name="email"]', "owner@example.com"); await p.fill('input[name="password"]', "password123");
await Promise.all([p.waitForURL(/dashboard/), p.click('button[type="submit"]')]);
await p.waitForLoadState("networkidle");
const steps = [["Orders","/orders"],["Products","/products"],["Meta Ads","/ads"],["Dashboard","/dashboard"],["Orders","/orders"],["Tasks","/tasks"],["Team","/team"],["Dashboard","/dashboard"]];
const rows = [];
for (const [label, path] of steps) {
  await p.waitForTimeout(1500);
  const t0 = Date.now();
  await p.locator("aside").getByRole("link", { name: label, exact: true }).first().click();
  await p.waitForFunction((path) => location.pathname === path || document.querySelector('[aria-busy="true"]'), path, { polling: 10 });
  const feedback = Date.now() - t0;
  await p.waitForFunction((path) => location.pathname === path && !document.querySelector('[aria-busy="true"]') && document.querySelector("main h1, h1"), path, { polling: 10 });
  const done = Date.now() - t0;
  rows.push(`${label.padEnd(10)} screen reacts ${String(feedback).padStart(5)} ms   page ready ${String(done).padStart(5)} ms`);
}
console.log(rows.join("\n"));
await b.close();

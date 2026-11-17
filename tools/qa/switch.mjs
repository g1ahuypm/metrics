import { chromium } from "playwright";
const base = process.argv[2];
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
await p.goto(base + "/login");
await p.fill('input[name="email"]', "owner@example.com"); await p.fill('input[name="password"]', "password123");
await Promise.all([p.waitForURL(/dashboard/), p.click('button[type="submit"]')]);
const values = () => p.evaluate(() => [...document.querySelectorAll("main input, main select, main textarea")]
  .filter((e) => e.type !== "hidden" && e.offsetParent)
  .map((e) => `${e.name || e.id || e.placeholder}=${e.type === "checkbox" || e.type === "radio" ? e.checked : e.value}`).join(" | "));
const pickStore = async (name) => { await p.getByRole("tab", { name }).click(); await p.waitForFunction((n) => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.includes(n), name); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800); };
let bad = 0;
for (const path of ["/settings", "/expenses", "/support", "/support/knowledge"]) {
  for (const [from, to] of [["Northwind Outfitters", "Brightway"], ["Brightway", "Northwind Outfitters"]]) {
    await p.goto(base + path); await pickStore(from);
    await pickStore(to);
    const switched = await values();
    await p.reload(); await p.waitForLoadState("networkidle");
    const fresh = await values();
    const ok = switched === fresh;
    if (!ok) bad++;
    console.log(`${ok ? "OK  " : "BUG "} ${path} ${from} -> ${to}${ok ? "" : "\n     after switch: " + switched.slice(0, 230) + "\n     fresh load:   " + fresh.slice(0, 230)}`);
  }
}
console.log(bad ? `${bad} problems` : "all boxes correct after switching");
await b.close();

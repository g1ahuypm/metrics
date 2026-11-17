import { chromium } from "playwright";
import { execSync } from "child_process";
execSync(`psql -h /tmp -p 5433 -U postgres margin -qc 'update "BankAccount" set included=true'`);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
const t0 = Date.now(); const log = [];
p.on("request", (r) => r.url().includes("/cash") && log.push(`${Date.now() - t0}ms start ${r.method()} ${r.headers()["next-action"] ? "action" : r.headers()["rsc"] ? "rsc" : "page"}`));
p.on("requestfinished", (r) => r.url().includes("/cash") && log.push(`${Date.now() - t0}ms done  ${r.method()} ${r.headers()["next-action"] ? "action" : r.headers()["rsc"] ? "rsc" : "page"}`));
p.on("requestfailed", (r) => log.push(`${Date.now() - t0}ms FAILED ${r.method()} ${r.headers()["next-action"] ? "action" : r.headers()["rsc"] ? "rsc" : "doc"} ${r.url().replace("http://localhost:3000", "")} ${r.failure()?.errorText}`));
p.on("response", async (r) => { if (r.request().headers()["next-action"]) log.push(`${Date.now() - t0}ms action response ${r.status()} ${r.headers()["content-type"]} ${r.headers()["x-action-revalidated"] ?? ""}`); });
p.on("console", (m) => log.push(`console.${m.type()} ${m.text().slice(0, 200)}`));
await p.goto("http://localhost:3000/login"); await p.fill('input[name="email"]', "owner@example.com"); await p.fill('input[name="password"]', "password123");
await Promise.all([p.waitForURL(/dashboard/), p.click('button[type="submit"]')]);
await p.goto("http://localhost:3000/cash"); await p.getByText("Is it profit?").waitFor();
const bal = async () => { const t = await p.locator("main").innerText(); return t.slice(t.indexOf("In your bank now") + 17).match(/\$[\d,.]+/)[0]; };
const box = p.locator("li", { hasText: "Savings" }).getByRole("checkbox");
for (let i = 0; i < 4; i++) {
  log.push(`---- click ${i + 1} (balance ${await bal()})`);
  await box.click({ timeout: 15000 }).catch(() => log.push("could not click: still disabled"));
  await p.waitForTimeout(4000);
  log.push(`after click ${i + 1}: balance ${await bal()}, disabled ${await box.isDisabled()}`);
}
console.log(log.join("\n"));
console.log("checkbox disabled after 6s:", await p.locator("li", { hasText: "Savings" }).getByRole("checkbox").isDisabled());
await b.close();

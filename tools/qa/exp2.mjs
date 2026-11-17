import { chromium } from "playwright";
const base = "http://localhost:3000";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
await p.goto(base + "/login"); await p.fill('input[name="email"]', "owner@example.com"); await p.fill('input[name="password"]', "password123");
await Promise.all([p.waitForURL(/dashboard/), p.click('button[type="submit"]')]);
await p.goto(base + "/expenses"); await p.waitForSelector('input[name="name"]');
for (const i of [1, 2, 3]) {
  const name = `Twice test ${i} ${Date.now()}`;
  await p.fill('input[name="name"]', name); await p.fill('input[name="amount"]', "5");
  await p.locator('form:has(input[name="name"]) button[type="submit"]').click({ timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(3000);
  console.log(`expense ${i} on screen without reload:`, (await p.getByText(name).count()) > 0);
}
await b.close();

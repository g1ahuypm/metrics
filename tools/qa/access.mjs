import { chromium } from "playwright";
const S1 = process.env.S1, base = "http://localhost:3000";
const b = await chromium.launch();
for (const email of ["owner@example.com", "admin@example.com", "partner@example.com"]) {
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } }); const p = await ctx.newPage();
  await p.goto(base + "/login");
  await p.fill('input[name="email"]', email); await p.fill('input[name="password"]', "password123");
  await Promise.all([p.waitForURL(/dashboard/), p.click('button[type="submit"]')]);
  const pills = async () => (await p.locator('[role="tab"]').allInnerTexts()).join(", ") || "(no switcher)";
  const looking = async () => (await p.locator("main p").first().innerText()).replace(/·.*/, "").trim();
  console.log(`\n== ${email}`);
  console.log(`  switcher: ${await pills()}`);
  console.log(`  dashboard: ${await looking()}`);
  await ctx.addCookies([{ name: "pd_store", value: "all", url: base }]);
  await p.goto(base + "/dashboard"); console.log(`  forced 'All stores' cookie -> ${await looking()}`);
  await p.goto(base + "/dashboard?store=" + S1); console.log(`  link to the first store -> ${await looking()}`);
  const csv = await p.request.get(base + "/api/export/daily?range=30d&store=" + S1).then((r) => r.text());
  console.log(`  CSV download of the first store: ${csv.split("\n").length - 1} lines, first line: ${csv.split("\n")[1]?.slice(0, 60)}`);
  await p.goto(base + "/team");
  console.log(`  team: invite form ${await p.getByText("Invite someone").count() ? "SHOWN" : "hidden"}, store tick-boxes ${await p.locator('td input[type="checkbox"]').count()}`);
  await ctx.close();
}
await b.close();

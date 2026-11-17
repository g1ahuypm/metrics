import { chromium } from "playwright";
import fs from "fs";
const LOG = "/var/tmp/pgmargin/log";
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ["/dashboard","/orders","/products","/ads","/support","/tasks","/inbox","/expenses","/team","/settings"];
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:3000/login");
await p.fill('input[name="email"]', "owner@example.com");
await p.fill('input[name="password"]', "password123");
await Promise.all([p.waitForURL(/dashboard/), p.click('button[type="submit"]')]);
const out = [];
for (const path of pages) {
  for (let run = 0; run < 3; run++) {
    const before = fs.statSync(LOG).size;
    const t0 = Date.now();
    const r = await p.request.get("http://localhost:3000" + path);
    await r.body();
    const ms = Date.now() - t0;
    await new Promise((res) => setTimeout(res, 300));
    const log = fs.readFileSync(LOG, "utf8").slice(before);
    const q = (log.match(/LOG:  (statement|execute)/g) || []).length;
    if (run === 2) out.push(`${path.padEnd(14)} ${String(ms).padStart(6)} ms  ${q} queries`);
  }
}
console.log(out.join("\n"));
await b.close();

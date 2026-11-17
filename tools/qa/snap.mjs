import { chromium } from "playwright";
import fs from "fs";
const dir = process.argv[2]; fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch(); const p = await b.newPage();
await p.goto((process.env.BASE||"http://localhost:3000")+"/login");
await p.fill('input[name="email"]', "owner@example.com"); await p.fill('input[name="password"]', "password123");
await Promise.all([p.waitForURL(/dashboard/), p.click('button[type="submit"]')]);
const prods = await p.request.get((process.env.BASE||"http://localhost:3000")+"/products?range=30d").then(r=>r.text());
const ids = [...new Set([...prods.matchAll(/href="\/products\/(\d+)/g)].map(m=>m[1]))];
const urls = [];
for (const r of ["7d","30d","90d"]) {
  for (const path of ["/dashboard","/products","/orders","/ads"]) urls.push(`${path}?range=${r}`);
  for (const id of ids) urls.push(`/products/${id}?range=${r}`);
  urls.push(`/api/export/daily?range=${r}`);
  for (const st of ["store2"]) for (const path of ["/dashboard","/products","/orders","/ads"]) urls.push(`${path}?range=${r}&store=${st}`);
  urls.push(`/api/export/daily?range=${r}&store=store2`);
}
for (const u of urls) {
  const t = await p.request.get((process.env.BASE||"http://localhost:3000")+""+u).then(r=>r.text());
  // keep only the visible text, minus the greeting line
  const text = t.replace(/<script[\s\S]*?<\/script>/g,"").replace(/<[^>]+>/g," ").replace(/Good (morning|afternoon|evening)/g,"").replace(/\s+/g," ");
  fs.writeFileSync(`${dir}/${u.replace(/[^\w]/g,"_")}.txt`, text);
}
console.log(urls.length, "pages saved; products:", ids.join(","));
await b.close();

# ProfitDeck — handoff for continuing work

Read this whole file before touching code. It is the state of the project and the
owner's expectations as of the last session.

## WHERE WE LEFT OFF (latest session, Oct 18, 2026) — read this first

Done and live (each verified in a browser against real store data before deploy):
- Costs re-price orders the moment they are saved; costs are per country (US/CA/AU/UK/NZ),
  no default; the costs page shows costs only (owner: no selling price there).
- Revenue matches Shopify Analytics to the cent (store timezone days; cancelled-but-not-
  refunded orders count like Shopify). Owner confirmed live numbers after Full resync.
- Layout rebuilt: Dashboard, Orders, Products (one page per product: P&L, bundles at exact
  prices, campaign tick-boxes, cost editor), Meta Ads, Setup. Owner: "everything is solid".
- Support inbox (Gmail + Claude replies, auto-send behind a safety gate, knowledge base,
  Support role) built and live. Gmail app password is connected (confirmed: the scheduled
  check logs in and returns "0 new emails"). GitHub Actions check every 5 min is green after
  the CRON_SECRET fix (secrets are now whitespace-trimmed).

Still open, in order:
1. Owner to add `ANTHROPIC_API_KEY` in Vercel and Redeploy (until then mail arrives but is not
   sorted or answered; Support shows a yellow warning). Not confirmed yet.
2. Owner to fill knowledge-base topic "Questions about a book" (facts) and review "The offer".
3. First real test: owner emails "where is my order?" from another address; review the real
   AI reply quality (only a stand-in for the Messages API was tested so far).
4. Owner said he will fix the shop policies (misspelled learnwelllsupport@ address and
   mailto links pointing to support@learnwell.com).
5. Optional ideas offered: break-even ROAS line on product page, negative-day alerts.
6. Advise rotating secrets pasted in earlier chats (Shopify client secrets, Neon password).

Working conventions: develop on branch `claude/determined-dirac-uw8e9m`; deploy by fast-
forwarding `claude/ecommerce-metrics-dashboard-ujpiqd` (owner approved deploying tested work).
Local testing used Postgres 16, real orders pulled read-only via the Shopify connector, a
local Dovecot IMAP + SMTP capture server for Support, and Playwright at 1360px and 390px.

## Who and what

- Owner: Huy (JP), CEO of **LearnWell Co**, a Shopify store (`rtnvmy-5d.myshopify.com`,
  custom domain trylearnwell.com, USD, timezone America/New_York, Basic plan).
  Non-technical. Wants a profit dashboard that replaces TrueProfit for himself and
  read-only partners. Communicates bluntly; wants it to *feel* like a real profit tool,
  not a pile of features. "Clean, organized, user-friendly" are his words.
- Store: ~59 products (physical books plus many $0 "(Digital)" bonus items),
  ~250 orders total, ~80 in the last 60 days. Sells to US, CA, AU, UK, NZ.
- The product he cares about right now: **Winnie the Pooh: The Complete Stories and Poems**
  (variant gid://shopify/ProductVariant/67182817607755, list $84.99) with the free gift
  **The Hundred Acre Wood Puzzle Packet** (list $19.99, always 100% discounted).

## The offer, from real orders (verified via Shopify API)

- **Buy 1:** list $84.99, automatic discount "Buy 1" $25 → customer pays **$59.99**.
- **Buy 2:** two books $169.98, order-level automatic discount "Buy 2" ($85.03 or $75.03)
  → customer pays **$84.95 or $94.95**, plus the puzzle packet at 100% off.
- Shipping charged is $0 or $6.95. Tax is $0. Shopify Payments fee appears on the
  SALE transaction (e.g. $3.21 on a $59.99 order).
- Shopify's `LineItem.discountedTotalSet` EXCLUDES order-level discounts, so the
  correct net line price is `originalTotalSet − Σ discountAllocations`. This is
  implemented in `src/lib/integrations/shopify.ts` (`netLine`).

## Repository and deployment

- GitHub: `g1ahuypm/metrics`, branch `claude/ecommerce-metrics-dashboard-ujpiqd`
  (also the repo's default branch). Every push auto-deploys.
- Live: **https://metrics-azure.vercel.app** (Vercel Hobby, project "metrics").
  Database: Neon Postgres (env `DATABASE_URL`). Env also has `APP_SECRET`, `CRON_SECRET`.
- Build = `prisma generate && prisma db push --skip-generate --accept-data-loss && next build`,
  so schema changes apply on deploy. Vercel Hobby allows one cron per day (06:00 UTC);
  an on-visit auto-sync (`src/lib/autosync.ts`) runs when data is over an hour old.
- Stack: Next.js 15 App Router + server actions, TypeScript, Tailwind 4, Prisma 6 on
  Postgres, Recharts. Local dev needs a Postgres `DATABASE_URL` (a local Postgres 16 was
  used for testing; `npm run setup` seeds demo data; owner@example.com / password123).
- Shopify auth: Dev Dashboard app "MetricsDeck" using the **client credentials grant**
  (Client ID `f68d2edc1ec472cb01b734945a3572c8`; secret is stored encrypted in the app's
  Settings — never put secrets in the repo or chat). Scopes: read_orders, read_products,
  read_inventory, read_customers. Custom apps can read only the last 60 days of orders.
  Admin-created custom apps (shpat_ tokens) no longer exist for new stores.
- Meta: system-user token with `ads_read` (owner generated one in the last session;
  whether it was pasted and synced in the live app is NOT confirmed).
- Secrets the owner has pasted in chat before: two Shopify client secrets (shpss_…),
  partial Neon password in a screenshot. Advise rotation when convenient.

## What exists (pages) — layout rebuilt around the owner's workflow

- Sidebar: **Dashboard, Orders, Products, Meta Ads**, then "Setup": Expenses & fees, Team,
  Settings. No global product selector any more (cookie `pd_product` removed); the date range
  is still global (cookie `pd_range`). /profit redirects to /dashboard, /sales to /orders.
- Dashboard (whole store) and every product page share `ProfitOverview`: 4 numbers (Revenue,
  Ad spend with true ROAS + CPA, Net profit, Margin), a simple profit statement (Revenue →
  product cost → shipping → fees → profit before ads → Meta ads → expenses → net profit),
  chart and a day-by-day table.
- Orders: every Shopify order in the range with revenue, product cost, shipping, fees, profit.
- Products: list of products that earned money (or had linked ad spend) with the exact
  numbers of their product page, plus spend from unlinked campaigns; "Other products" grid
  for the rest (free gifts, digital bonuses, products needing costs).
- Product page `/products/<numeric Shopify id>`: switcher, ProfitOverview for that product,
  **Bundles** (one row per bundle size × exact price paid, per-order costs, profit before
  ads = break-even CPA), **Campaigns that sell this product** (checkboxes; the one place to
  link campaigns, `Campaign.productId`), **Your costs** (per-country editor).
- Meta Ads: spend, true ROAS (Shopify revenue ÷ spend), Meta ROAS, cost per order,
  campaign table with each campaign's product (link) or "Not linked".
- Product view math (`loadOrderSlices`): product lines exact; order-level amounts split by
  the product's share of the order; $0 lines of other products are gifts and their cost goes
  to the paid product; ad spend = insights of campaigns linked to the product only.

## Customer support (Support in the sidebar)

- Gmail `learnwellsupport@gmail.com` over IMAP/SMTP with a Google **app password**
  (Settings → Support inbox; stored encrypted). Only INBOX is read, never Spam.
  `src/lib/support/mail.ts` (imapflow + mailparser + nodemailer); contact-form mail from
  Shopify's mailer is answered at its Reply-To; quoted history is stripped.
- Pipeline `src/lib/support/run.ts` `runSupport()`: fetch → store threads (Gmail thread id or
  In-Reply-To/References) → newsletters/automated mail skip the AI → one Claude call per
  thread (`src/lib/support/ai.ts`: `claude-opus-5-5`, structured output, `fallbacks:"default"`,
  effort medium, knowledge base in a cached system prompt, the email marked untrusted) →
  safety gate → send. Owner chose **auto-send without approval**; the gate still holds:
  needsPerson (anger, chargeback, legal, payments, prompt injection, unknown topic), not
  "high" confidence, topic with autoSend off, a reply naming an order that isn't the
  sender's, >2 AI replies per thread per day, >150 per day. Held emails keep a draft.
  Topics with "team must act" are answered and stay in "Needs you" with a To do.
- Orders for a reply come from Shopify by the sender's email only; an order number the
  sender mentions is looked up together with their email (no leaking other customers').
- Knowledge base (`KbArticle`, Support → Knowledge base) seeded from the store's Refund and
  Shipping policies; "Questions about a book" needs real facts from the owner.
- Role `SUPPORT`: only /support pages; every other page redirects to /support; no CSV.
- Scheduling: `.github/workflows/support-check.yml` calls `GET /api/cron/support` every 5 min
  (needs GitHub secret `CRON_SECRET`); opening Support also checks if >2 min old. A run
  holds a lock (`Settings.supportLockUntil`), starts AI work only in its first 12 s, each AI
  call times out at 40 s, so it fits Vercel's 60 s; interrupted claims are released after
  10 min; rate limits/outages leave the email queued for the next check (after 3 failed
  tries it goes to the team). Mail from the first scan (last 14 days, `SupportMessage.history`)
  is sorted and drafted but never auto-sent, since it may already be answered in Gmail.
- Needs `ANTHROPIC_API_KEY` in Vercel. Tested locally against Dovecot (IMAP), an SMTP
  capture server and a stand-in for the Messages API; real-model replies not yet seen.

## Costing rules (src/lib/costing.ts, costbook.ts)

Tier lookup order: variant+country → product+country → variant default → product default.
Exact quantity match, else nearest smaller tier scaled per unit. Order shipping cost =
Σ tier shipping when any line is tier-priced, else the per-order default. Falls back to
Shopify "cost per item", then fallback % of price. Country comes from the shipping
address (or presentment currency when address access is denied).

Product view (src/lib/metrics.ts `loadOrderSlices`): line-level amounts are exact;
order-level amounts (tax, shipping charged, fees, refunds, handling) split by the
product's share of the order subtotal; fixed expenses split by share of the day's
store-wide revenue; $0 lines of other products in the same order are treated as gifts.

## OPEN PROBLEMS — the owner's current complaints, in priority order

1. ~~**Edits don't recalculate.**~~ **Fixed.** Saving product costs re-prices every order
   containing that product (`repriceOrders` in `src/lib/costbook.ts`, bulk SQL, writes only
   changed rows) and shows "Saved · N orders updated". Saving Expenses assumptions re-prices
   all orders (handling, platform fee %, and payment fees where `Order.feesEstimated` is true;
   Shopify-reported fees are never overwritten; `null` = synced before tracking, left as is).
   Every sync also re-prices. The "Apply to past orders" button and the "sells for" override
   (`CostTier.sellPrice`, `ProductVariant.priceOverride`) were removed: the column is now a
   read-only "Customers paid" = average of real orders per bundle size, same as the P&L.
   Also fixed while verifying on real orders: lines use Shopify `currentQuantity` (order edits,
   e.g. #LW001285 had a removed upsell line), refunds are no longer subtracted twice
   (current totals already exclude them), the same variant on several lines in one order is
   costed at the combined bundle tier (Zipify post-purchase upsells), bundle sizes on the
   Product costs page are counted per order, and per-unit cost is no longer rounded
   (3 × $13.33 ≠ $40). These sync fixes reach existing orders only after a Full resync.
   Costs are entered **per country only** (owner: supplier cost differs for US/CA/AU/UK/NZ;
   there is no default). The "Default" tab is gone; country tabs show green (set) / amber
   (sold there, no costs). Tiers under country "" remain only for "No cost (digital or
   bonus)" ($0 everywhere) or as older all-country costs, which the card flags with a
   "Remove them" button. The page shows costs only (no selling price, no averages):
   the owner was explicit that selling price does not belong there.
   **Revenue matches Shopify Analytics to the cent** (verified Oct 11–17, 7/7 days, against
   ShopifyQL `total_sales`): days are split in the store timezone (`Settings.timezone`, set
   from Shopify `shop.ianaTimezone` on every sync; `src/lib/dates.ts` dayStart/storeDate),
   and cancelled orders count like Shopify does (charged − refunded, no product/shipping
   cost), e.g. #LW001286 was cancelled but not refunded and Shopify counts its $66.94.
2. ~~**Product ↔ campaign linking is confusing.**~~ **Done:** campaigns are ticked on the
   product page; verified that linked spend flows to product page, list and Meta Ads.
   Was: **Product ↔ campaign linking is confusing.** "Sells product" is only visible on
   the Meta Ads campaign table when campaigns have synced; the owner could not find
   it. Required: a first-class, obvious way to link campaigns to a product (e.g. on
   the product itself, or a dedicated "Products & campaigns" setup), with clear
   state when nothing is linked, and consistent numbers across every page.
3. ~~**Overall feel.**~~ **First pass done** (layout above, modelled on TrueProfit). Was:
   **Overall feel: "disorganized, cheap, not a profit dashboard."** Rethink the
   information architecture around the owner's actual workflow: pick a product →
   see its P&L, its unit economics per bundle (Buy 1 / Buy 2), its linked campaigns
   and true ROAS/CPA → adjust costs → numbers update live. Fewer tiles, clearer
   hierarchy, consistent terminology (Revenue = what customers paid), no demo-data
   banner on a connected store, nothing that needs explaining.
4. ~~Meta connection~~ **Confirmed by the owner on the live app (Oct 18, 2026):** Meta
   connected and synced, campaigns ticked on the product page, numbers checked.
5. **Done (owner confirmed Oct 18, 2026):** Full resync run, live numbers checked
   against Shopify and Meta. Original note: after the net-price fix the owner must run **Full resync (60 days)** once and
   then re-price orders; confirm the live numbers afterwards against Shopify
   (e.g. order #LW001289 should show the book line at $84.95, not $169.98).

## Working rules that were followed

- Verify against real data: the claude.ai Shopify connector (read-only GraphQL) was
  used to inspect products/orders; validate every GraphQL query before shipping.
- Every push was verified locally: typecheck, `next build`, seed, Playwright run of
  every page at several widths, P&L ledger == CSV totals to the cent, re-price checks.
- Commit messages describe the change; never commit `.env`, tokens, or `dev.db`.
- Speak plainly to the owner, step by step, no jargon; one task at a time.

# ProfitDeck

A self-hosted profit dashboard for Shopify stores running Meta ads. It replaces tools like TrueProfit with one screen for net profit, Shopify sales and Meta campaign performance, and it lets you share that screen with partners and teammates.

## What it does

- **Net profit, computed daily.** Revenue minus refunds, taxes, cost of goods, shipping, payment fees, Meta ad spend and your custom costs (apps, contractors, agencies).
- **Shopify sales.** Orders, refunds, average order value, new vs returning customers, per-product revenue and gross margin. Cost of goods comes from Shopify's "Cost per item", with manual overrides.
- **Meta Ads.** Spend, ROAS, CPA, CTR, CPC, CPM and attributed purchases per campaign, compared with real Shopify orders. Blended metrics such as MER, POAS and cost per new customer.
- **Team access.** Invite partners with a link. Owners and admins edit; partners get read-only access to every report.
- **Any date range** with comparison against the previous period.
- **Demo mode.** Seed 90 days of realistic sample data to explore before connecting anything.

## Stack

Next.js 15 (App Router, server actions), TypeScript, Tailwind CSS 4, Prisma 6 (SQLite by default, Postgres for production), Recharts.

## Quick start

```bash
cp .env.example .env
# set APP_SECRET and CRON_SECRET to random strings (openssl rand -base64 32)
npm install
npm run setup      # generates the Prisma client, creates the DB, seeds the owner + demo data
npm run dev
```

Open http://localhost:3000 and sign in with the seeded owner:

| Email | Password | Role |
|---|---|---|
| owner@example.com | password123 | Owner |
| mediabuyer@example.com | password123 | Admin |
| partner@example.com | password123 | Partner (read-only) |

Change these in `.env` (`SEED_OWNER_*`) before seeding, or set `SEED_DEMO_DATA=false` to seed only the owner account. If you skip seeding entirely, the first visit to the app asks you to create the owner account.

## Connecting your accounts

Go to **Settings** (owner or admin only).

**Shopify**
1. Shopify admin → Settings → Apps and sales channels → Develop apps → Create an app.
2. Configure Admin API scopes: `read_orders`, `read_products`, `read_inventory`. Add `read_all_orders` if you want more than 60 days of history.
3. Install the app and paste the Admin API access token plus your `*.myshopify.com` domain.
4. Set **Cost per item** on your product variants in Shopify so cost of goods syncs automatically. Anything missing can be filled in on the Costs page.

**Meta Ads**
1. Meta Business Settings → Users → System users → add a system user and assign it the ad account.
2. Generate a token with the `ads_read` permission. System-user tokens do not expire.
3. Paste the token and the ad account ID (the number after `act=` in Ads Manager, with or without the `act_` prefix).

Tokens are stored in the database encrypted with `APP_SECRET`. Click **Sync now** on each card after connecting. The first sync pulls 90 days of history.

## Keeping data fresh

`GET /api/cron/sync` runs both syncs. It requires the `CRON_SECRET` as a bearer token:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/sync
```

`vercel.json` already schedules this hourly on Vercel. On any other host, add a cron job or an uptime monitor that hits the URL.

## How profit is calculated

| Line | Source |
|---|---|
| Revenue | Order total charged to the customer, including shipping and tax |
| Refunds | Shopify `totalRefunded`, attributed to the order date |
| Taxes collected | Shopify order tax, treated as a pass-through cost |
| Cost of goods | Line quantity × unit cost (Shopify cost per item, manual override, or fallback % of price) |
| Shipping cost | The per-order shipping cost from Costs → assumptions (Shopify does not expose label costs via the API) |
| Payment fees | Shopify Payments fees when reported on the transaction, otherwise `% + fixed` from assumptions |
| Meta ad spend | Campaign-level daily spend from the Marketing API |
| Other costs | Custom costs: monthly (spread per day), daily, one-time, % of revenue, or per order |

**Gross profit** = revenue − refunds − taxes − COGS − shipping − fees.
**Net profit** = gross profit − ad spend − other costs.

Derived metrics: MER = revenue ÷ ad spend, POAS = gross profit ÷ ad spend, Blended CPA = ad spend ÷ orders, cost per new customer = ad spend ÷ first-time customers. Meta ROAS and CPA use Meta's own attributed purchases and are shown side by side with Shopify orders so you can see the gap.

All daily bucketing uses UTC calendar days so Shopify orders and Meta daily insights line up.

## Roles

| Role | Can |
|---|---|
| Owner | Everything, including inviting admins and managing integrations |
| Admin | Edit costs, settings and integrations; invite partners |
| Partner | View every report and cost; cannot change anything |

## Production

1. Use Postgres: set `DATABASE_URL` and change `provider = "sqlite"` to `"postgresql"` in `prisma/schema.prisma`, then run `npx prisma migrate deploy` (or `npx prisma db push`).
2. Set `APP_SECRET`, `CRON_SECRET` and `APP_URL` (used to build invite links behind a proxy).
3. `npm run build && npm start`, or deploy to Vercel/Railway/Fly. The build output is `standalone`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run setup` | Generate client, push schema, seed |
| `npm run db:seed` | Seed owner and demo data |
| `npm run db:studio` | Browse the database |
| `npm run typecheck` | TypeScript check |

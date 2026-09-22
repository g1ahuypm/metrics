# ProfitDeck

A self-hosted profit dashboard for Shopify stores running Meta ads. It replaces tools like TrueProfit with one screen for net profit, Shopify sales and Meta campaign performance, and it lets you share that screen with partners and teammates.

## What it does

- **Net profit, computed daily.** Revenue minus refunds, taxes, cost of goods, shipping, payment fees, Meta ad spend and your custom costs (apps, contractors, agencies).
- **Supplier costs per bundle.** Enter what you pay for 1, 2, 3… units of each product (product cost plus shipping). Every order line is priced from those tiers automatically, so testing many products never mixes up their margins.
- **Shopify sales.** Orders, refunds, average order value, new vs returning customers, per-product revenue and gross margin.
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

## What you need

Nothing beyond this repository and Node.js 22 to run it locally. To put it online you need a host and, optionally, a Postgres database:

| Need | Free or cheap options |
|---|---|
| Hosting | [Vercel](https://vercel.com) (zero-config for Next.js, hourly cron included), [Railway](https://railway.app), [Render](https://render.com), or any VPS with Docker |
| Database | SQLite (built in, fine for one store) or Postgres on [Neon](https://neon.tech) / [Supabase](https://supabase.com) for Vercel-style hosts that have no persistent disk |
| Hourly sync trigger | Vercel Cron (already configured), the `sync` service in `docker-compose.yml`, or a free ping service such as cron-job.org |
| Shopify | A custom app in your own store admin (no App Store listing needed) |
| Meta | A system-user token from Business Settings |

No TrueProfit, Triple Whale or similar subscription is needed. Voice or note-taking tools are unrelated to running this; the app has its own web interface.

## Connecting your accounts

Go to **Settings** (owner or admin only).

**Shopify**
1. Shopify admin → Settings → Apps and sales channels → Develop apps → Create an app.
2. Configure Admin API scopes: `read_orders`, `read_products`, `read_inventory`. Add `read_all_orders` if you want more than 60 days of history.
3. Install the app and paste the Admin API access token plus your `*.myshopify.com` domain.
4. Run **Sync now**. Your products appear on the **Product costs** page, where you enter supplier costs per bundle size. Shopify's "Cost per item" is used only for products with no tiers.

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
| Product cost | Supplier cost tiers from the Product costs page (exact match on quantity, otherwise the nearest smaller tier scaled per unit). Falls back to Shopify cost per item, then to the fallback % of price |
| Shipping cost | Supplier shipping from the same tiers. Orders with no tier-priced product use the per-order shipping from Expenses → assumptions |
| Handling cost | Per-order handling from Expenses → assumptions |
| Payment fees | Shopify Payments fees when reported on the transaction, otherwise `% + fixed` from assumptions |
| Meta ad spend | Campaign-level daily spend from the Marketing API |
| Shopify platform fees | Optional % surcharge when you use a third-party gateway |
| Expenses | Custom costs: monthly (spread per day), daily, one-time, % of revenue, or per order |

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

## Deploying

**Docker (any VPS)**

```bash
cp .env.example .env   # set APP_SECRET, CRON_SECRET, APP_URL
docker compose up -d --build
```

The database is a SQLite file on the `profitdeck-data` volume and the `sync` service triggers the hourly sync. Put a reverse proxy with HTTPS (Caddy, Nginx, Cloudflare Tunnel) in front of port 3000.

**Vercel + Postgres**

1. Create a Postgres database (Neon or Supabase) and copy its connection string.
2. In `prisma/schema.prisma` change `provider = "sqlite"` to `provider = "postgresql"`, commit, and run `npx prisma db push` once against that database.
3. Import the repository in Vercel and set `DATABASE_URL`, `APP_SECRET`, `CRON_SECRET` and `APP_URL`. Vercel Cron picks up `vercel.json` and calls the sync hourly.
4. Open the deployed URL, create the owner account, connect Shopify and Meta, and sync.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run setup` | Generate client, push schema, seed |
| `npm run db:seed` | Seed owner and demo data |
| `npm run db:studio` | Browse the database |
| `npm run typecheck` | TypeScript check |

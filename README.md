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

Next.js 15 (App Router, server actions), TypeScript, Tailwind CSS 4, Prisma 6 on Postgres, Recharts.

## Put it online (recommended)

Two free accounts, no installs. About 15 minutes.

**1. Database (Neon)**
1. Sign up at [neon.tech](https://neon.tech) and create a project (any name, nearest region).
2. On the project dashboard click **Connect**, untick *Connection pooling*, and copy the connection string. It looks like `postgresql://…neon.tech/neondb?sslmode=require`.

**2. Hosting (Vercel)**
1. Sign up at [vercel.com](https://vercel.com) with your GitHub account and click **Add New → Project**.
2. Import the `metrics` repository. Leave the framework as Next.js and the root directory as is.
3. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string |
   | `APP_SECRET` | a long random string (for example, mash the keyboard for 40 characters) |
   | `CRON_SECRET` | another random string |

4. Click **Deploy**. The build creates the database tables automatically.
5. Open the URL Vercel gives you (something like `metrics-xyz.vercel.app`). The first visit asks you to create the owner account.

Then connect Shopify in Settings, enter product costs, and invite partners from the Team page. The link works for anyone you invite.

**Keeping data fresh.** Every time someone opens the dashboard and the data is more than an hour old, a sync runs in the background. A daily scheduled sync at 06:00 UTC runs as well (Vercel's free plan allows one scheduled run per day).

**Custom domain.** Vercel → project → Settings → Domains lets you use something like `profit.yourbrand.com`.

## Run on your own computer

Needs Node.js 22 and a Postgres connection string (a free Neon database works here too).

```bash
cp .env.example .env     # set DATABASE_URL, APP_SECRET, CRON_SECRET
npm install
npm run setup            # creates tables and seeds the owner + demo data
npm run dev
```

Open http://localhost:3000 and sign in with the seeded owner:

| Email | Password | Role |
|---|---|---|
| owner@example.com | password123 | Owner |
| mediabuyer@example.com | password123 | Admin |
| partner@example.com | password123 | Partner (read-only) |

Change these in `.env` (`SEED_OWNER_*`) before seeding, or set `SEED_DEMO_DATA=false` to seed only the owner account.

## What you need

Nothing beyond this repository and Node.js 22 to run it locally. To put it online you need a host and, optionally, a Postgres database:

| Need | Free or cheap options |
|---|---|
| Hosting | [Vercel](https://vercel.com) free plan (zero-config for Next.js), or any VPS with Docker |
| Database | Postgres on [Neon](https://neon.tech) free plan, or the Postgres container in `docker-compose.yml` |
| Keeping data fresh | Automatic: a background sync runs on page visits when data is over an hour old, plus a daily scheduled sync on Vercel or an hourly one in Docker |
| Shopify | A free app in your Dev Dashboard (dev.shopify.com), installed only on your own store |
| Meta | A system-user token from Business Settings |

No TrueProfit, Triple Whale or similar subscription is needed. Voice or note-taking tools are unrelated to running this; the app has its own web interface.

## Connecting your accounts

Go to **Settings** (owner or admin only).

**Shopify**

Shopify apps are created in the [Dev Dashboard](https://dev.shopify.com). The dashboard uses the client credentials grant, so there is no token to copy: it exchanges your app's Client ID and Client secret for a 24-hour access token and renews it automatically.

1. Go to dev.shopify.com → Apps → **Create app** → *Start from Dev Dashboard*. Name it anything.
2. Open **Versions** → **New version**. Under Scopes tick:

   | Scope | Used for |
   |---|---|
   | `read_orders` | Orders, refunds, line items, Shopify Payments fees |
   | `read_products` | Product and variant names, SKUs, prices, images |
   | `read_inventory` | Shopify's "Cost per item" (used only when you have not entered supplier costs) |
   | `read_customers` | Customer ID on orders, for new vs returning customers |

   Then **Release**.
3. On the app's Overview page click **Install app** (Installs card), choose your store and confirm. The app must be installed on the store.
4. **App settings → Credentials**: copy the Client ID and Client secret into the dashboard's Settings page together with your `*.myshopify.com` domain. Click *Save & test connection*.
5. Optional but recommended: **App settings → Protected customer data access**, pick a reason such as Analytics and save. This lets orders be matched to customers for new-vs-returning counts. Without it everything else still syncs.

Shopify lets apps read the last **60 days** of orders. The first sync imports those, and every sync after that keeps adding new orders, so history builds up from the day you connect.

If you still have an admin-created custom app from before Shopify retired them, paste its `shpat_` token in the legacy field instead of a client ID and secret.

**Meta Ads**
1. Meta Business Settings → Users → System users → add a system user and assign it the ad account.
2. Generate a token with the `ads_read` permission. System-user tokens do not expire.
3. Paste the token and the ad account ID (the number after `act=` in Ads Manager, with or without the `act_` prefix).

Secrets are stored in the database encrypted with `APP_SECRET`. Click **Sync now** on each card after connecting. The first sync pulls 90 days of history.

## Keeping data fresh

`GET /api/cron/sync` runs both syncs. It requires the `CRON_SECRET` as a bearer token:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/sync
```

`vercel.json` schedules this daily on Vercel (the free plan's limit); the on-visit auto-sync keeps data fresher than that in practice. On any other host, add a cron job or an uptime monitor that hits the URL.

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

## Self-host with Docker

```bash
cp .env.example .env   # set APP_SECRET, CRON_SECRET, APP_URL (DATABASE_URL is set by compose)
docker compose up -d --build
```

This starts Postgres, the dashboard on port 3000, and an hourly sync. Put a reverse proxy with HTTPS (Caddy, Nginx, Cloudflare Tunnel) in front.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run setup` | Generate client, push schema, seed |
| `npm run db:seed` | Seed owner and demo data |
| `npm run db:studio` | Browse the database |
| `npm run typecheck` | TypeScript check |

## Customer support inbox

Support (sidebar) shows the support Gmail inside the dashboard. New emails are sorted
(customers vs spam, pitches, newsletters), answered by Claude from the Knowledge base and
the customer's Shopify order, and sent from the support address. Angry customers,
chargebacks, unclear or unusual emails, and topics marked "Person answers" wait for the team
with a draft ready. Team members with the **Support** role see only this inbox.

Setup:

1. Settings → Support inbox: the Gmail address and a Google **app password**
   (myaccount.google.com/apppasswords, needs 2-Step Verification).
2. Vercel environment variable `ANTHROPIC_API_KEY` (console.anthropic.com → API keys).
3. GitHub repository secret `CRON_SECRET` (same value as in Vercel) so
   `.github/workflows/support-check.yml` calls `GET /api/cron/support` every 5 minutes.
   Opening the Support page also checks when the last check is over 2 minutes old.

Optional for other providers or testing: `SUPPORT_IMAP_HOST/PORT/SECURE`,
`SUPPORT_SMTP_HOST/PORT/SECURE` (defaults: Gmail, 993/465 with TLS).


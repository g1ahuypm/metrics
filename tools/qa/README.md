# Local QA kit (not part of the app)

How every change was tested before going live. Nothing here is deployed (Next only builds `src/`).
The sandbox can't reach the live site, Plaid or the store with the app's own keys, so testing is done on a
local copy with demo data and stand-ins, and live behaviour is confirmed through the GitHub Actions log of
the "Check support inbox" workflow (trigger it with workflow_dispatch; its last step prints the
/api/cron/sync result, including `banks`).

## One-time setup (fresh container)

```bash
# database (Postgres 16 is preinstalled)
mkdir -p /var/tmp/pgmargin && chown postgres /var/tmp/pgmargin
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/tmp/pgmargin/data -A trust"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pgmargin/data -o '-p 5433 -k /tmp' -l /var/tmp/pgmargin/log start"
psql -h /tmp -p 5433 -U postgres -c "create database margin"
# log every statement (measure.mjs counts queries per page from this log)
psql -h /tmp -p 5433 -U postgres -c "alter system set log_statement='all'" -c "alter system set log_line_prefix='%m '" -c "select pg_reload_conf()"

# app: .env in the repo root (git-ignored), then deps + demo data (owner@example.com / password123)
cat > .env <<'X'
DATABASE_URL="postgresql://postgres@localhost:5433/margin?host=/tmp"
APP_SECRET="local-test-secret-0123456789abcdef0123456789"
CRON_SECRET="localcron"
SEED_OWNER_EMAIL="owner@example.com"
SEED_OWNER_PASSWORD="password123"
SEED_OWNER_NAME="Huy"
SEED_DEMO_DATA="true"
X
npm ci && npm run setup

# Playwright for the scripts (Chromium is preinstalled; never run "playwright install")
cd tools/qa && npm init -y >/dev/null && npm i playwright@1.56.1 --no-audit --no-fund && cd ../..
```

Optional extras used in earlier sessions: a second test store (`insert into "Store"(id,name,color,"sortOrder",
currency,timezone,"createdAt") values ('store2','Brightway','#E8590C',1,'USD','America/Los_Angeles',now())`, then
move a third of the orders to it), a shared expense, an admin with one store and a partner with two
(`access.mjs` expects admin@example.com / partner@example.com, password123), and test payouts (`payouts.sql`,
which `fakepayouts.json` mirrors for the Plaid stand-in; the store id in it is a placeholder: replace it with
the first store's id).

## Every session

```bash
tools/qa/up.sh            # restarts the db + relay if the sandbox stopped them (it does, often)
npx next build
# run through the relay (port 5434) so DELAY can simulate a far-away database
DATABASE_URL="postgresql://postgres@127.0.0.1:5434/margin" PORT=3000 nohup npx next start > /tmp/margin-qa-server.log 2>&1 &
# with the Plaid stand-in:
(cd tools/qa && nohup node fakeplaid.js > /tmp/margin-qa-fakeplaid.log 2>&1 &)
PLAID_CLIENT_ID=test-client PLAID_SECRET=test-secret PLAID_BASE_URL=http://127.0.0.1:7777 DATABASE_URL=... npx next start
```

Stop servers with `ps aux | grep -E "next-server|next start" | grep -v grep | awk '{print $2}' | xargs -r kill`.
Never `pkill -f "next start"`: it matches the shell running it and kills the command.

## The checks

| Script | What it proves |
|---|---|
| `snap.mjs DIR` + `cmp.sh` | Saves the visible text of 54 pages (dashboard, orders, products, every product page, ads, CSV; 7/30/90 days; all stores and store2). Take `before` on the old build (a `git worktree` of the live commit on port 3001, `BASE=http://localhost:3001 node snap.mjs before`) and `after` on the new one, then `bash cmp.sh`: every word/number must match (compared as sorted words, because streaming reorders blocks). A new menu word shows up as one difference per page. Take both snapshots back to back: crossing midnight in New York shifts the ranges. |
| `measure.mjs` | Server time and SQL count per page (start the relay with `DELAY=40` to simulate a remote database). |
| `clicks.mjs BASE` | Real clicks through the menu on a simulated 4G phone: time until the screen reacts and until the page is ready. |
| `exp2.mjs`, `tog2.mjs` | Several saves in a row on the same page each update the screen (Expenses form; Cash account switch). This is the test that caught the loading.tsx / staleTimes freeze. |
| `switch.mjs BASE` | After switching stores, every form box equals a fresh load of that store (Settings, Expenses, Support, Knowledge base). |
| `access.mjs` | Owner / admin with one store / partner with two: switcher, forced "all" cookie, links and CSV to a store they lack, Team controls. |
| `cash2.mjs PHASE STEP` | Cash page end to end against `fakeplaid.js` (`echo '{"phase":1}' > fakeplaid-state.json`; steps `connect`, `sort`, then phase 2 `refresh`, or `check`): every figure compared with totals computed independently from the stand-in's raw data, parts add up to the balance, payouts matched. Set `"loginRequired": true` in the state file to test re-login. |
| `payout-test.ts` | Shopify payouts sync against a stand-in (fetch is replaced): old cached key refused, fresh key fetched once, 3 pages saved, next run reads one page. Run from the repo root with a temporary `node_modules/server-only` stub (an empty package): `DATABASE_URL=... APP_SECRET=... npx tsx --tsconfig tsconfig.json tools/qa/payout-test.ts`, then remove the stub. |

## Support inbox stand-ins (`tools/qa/support/`)

A local IMAP mailbox (Dovecot), an SMTP catcher and a fake Claude API, so the whole Support pipeline runs
end to end. `apt-get install -y dovecot-imapd`, `useradd -r -M vmail`, `mkdir -p /var/tmp/mail && chown vmail /var/tmp/mail`,
`echo 'support@test.local:{PLAIN}abcdabcdabcdabcd' > /var/tmp/dovecot-users`, `dovecot -c "$PWD/tools/qa/support/dovecot.conf"`
(IMAP on 1143), `node tools/qa/support/smtp.js` (2525, writes to `support/sent/`), `node tools/qa/support/fakeai.js` (7778;
"furious"/"chargeback" → upset customer, "puzzle" → held for a person, anything else → confident auto-reply). Start the app with
`ANTHROPIC_API_KEY=test-key ANTHROPIC_BASE_URL=http://127.0.0.1:7778 SUPPORT_IMAP_HOST=127.0.0.1 SUPPORT_IMAP_PORT=1143
SUPPORT_IMAP_SECURE=false SUPPORT_SMTP_HOST=127.0.0.1 SUPPORT_SMTP_PORT=2525 SUPPORT_SMTP_SECURE=false`, connect
support@test.local / abcdabcdabcdabcd in Settings, run `/api/cron/support` once (first scan), then drop emails in with
`bash tools/qa/support/deliver.sh ID "Name" email "Subject" "Body" [<in-reply-to@id>]` and run `/api/cron/support` again.

Colours for charts: run the dataviz validator before adding a categorical pair (the Cash in/out pair
`--cash-in`/`--cash-out` in globals.css passed light and dark).

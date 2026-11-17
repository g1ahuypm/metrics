#!/bin/bash
# Start (or restart) the local test database and the timing relay. The sandbox stops background
# processes now and then; run this whenever a test says it can't reach the database.
# First time: see README.md (initdb + seed).
QA="$(cd "$(dirname "$0")" && pwd)"
psql -h /tmp -p 5433 -U postgres -c "select 1" >/dev/null 2>&1 || { su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pgmargin/data -o '-p 5433 -k /tmp' -l /var/tmp/pgmargin/log start" >/dev/null 2>&1; sleep 2; }
nc -z localhost 5434 2>/dev/null || (cd "$QA" && DELAY=${DELAY:-0} nohup node proxy.js > /tmp/margin-qa-proxy.log 2>&1 &)
sleep 1; psql -h /tmp -p 5433 -U postgres -tAc "select 'db ok'"

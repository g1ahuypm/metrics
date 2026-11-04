import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Banknote, Clock, Landmark, Wallet } from "lucide-react";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { getScope } from "@/lib/scope";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { getMetrics } from "@/lib/metrics";
import { plaidConfigured } from "@/lib/cash/plaid";
import { getCashReport, getCashTransactions } from "@/lib/cash/report";
import { categoryGroup, categoryLabel, plaidHint } from "@/lib/cash/categories";
import { ruleMatchFor } from "@/lib/cash/categorize";
import { PAYOUT_SCOPES_NOTE } from "@/lib/cash/payouts";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { KpiCard } from "@/components/KpiCard";
import { PlaidButton } from "./PlaidButton";
import { AccountToggle, CashChart, DeleteRule, DisconnectBank, RefreshButton, TxCategory } from "./CashClient";

type Search = { range?: string; from?: string; to?: string; show?: string };

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtMoney(Math.abs(n))}`;

export default async function CashPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireOwner();
  const sp = await searchParams;
  // The bank is shared by every store, so this page always covers all of them.
  const scope = await getScope(me, { ...sp, store: "all" });
  const { range } = scope;
  const onlyUnsorted = sp.show === "unsorted";
  const [connections, report, txs, rules, metrics] = await Promise.all([
    db.bankConnection.findMany({ orderBy: { createdAt: "asc" }, include: { accounts: { orderBy: { name: "asc" } } } }),
    getCashReport(range),
    getCashTransactions(range, { onlyUnsorted }),
    db.cashRule.findMany({ orderBy: { createdAt: "desc" } }),
    getMetrics(range, { storeIds: scope.storeIds }, undefined, { previous: false }),
  ]);
  const stores = scope.stores.stores.map((s) => ({ id: s.id, name: s.name, color: s.color }));
  const storeOf = new Map(stores.map((s) => [s.id, s]));
  const configured = plaidConfigured();
  const tz = me.timeZone ?? range.tz;
  const lastSync = connections.map((c) => c.lastSyncAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
  const owner = report.allTime.owner + report.opening;
  const pqs = sp.range || sp.from ? `${sp.range ? `range=${sp.range}` : `from=${sp.from}&to=${sp.to}`}&` : "";

  return (
    <div>
      <PageHeader title="Cash" description={`Your bank and Shopify payouts · ${range.label}`}>
        <DateRangePicker range={range} />
        {connections.length > 0 && <RefreshButton />}
      </PageHeader>

      {!configured && connections.length === 0 && <SetupCard />}
      {configured && connections.length === 0 && (
        <div className="card mb-6 p-6">
          <h2 className="text-lg font-extrabold tracking-tight">Connect your bank</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Margin reads your account balance and transactions through Plaid. It can only read: it can never move money. You log in to your bank in Plaid&apos;s own window, so Margin never sees your
            bank password.
          </p>
          <div className="mt-4">
            <PlaidButton label="Connect your bank" />
          </div>
          <p className="mt-3 text-xs text-ink-3">Tip: do this on a computer. Some banks open their login in a pop-up, which works best in a normal browser window.</p>
        </div>
      )}

      {connections
        .filter((c) => c.needsReconnect)
        .map((c) => (
          <div key={c.id} className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-warn/15 px-4 py-3 text-sm text-warn-text">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{c.institutionName ?? "Your bank"} needs you to log in again before new transactions come in.</span>
            <PlaidButton reconnectId={c.id} label="Log in again" primary={false} />
          </div>
        ))}

      {report.connected && (
        <>
          {/* What is in the bank, and how much of it the business earned. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="card p-5 lg:col-span-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink-2">
                <Landmark className="h-4 w-4" /> In your bank now
              </div>
              <div className="mt-2 text-[34px] font-extrabold tracking-tight tnum">{fmtMoney(report.balance)}</div>
              <p className="text-xs text-ink-3">Updated {fmtDateTime(lastSync, tz)}{report.pending.count > 0 ? ` · ${report.pending.count} pending (${signed(report.pending.amount)}) not counted yet` : ""}</p>
              <ul className="mt-4 space-y-1.5 text-sm">
                {connections.flatMap((c) =>
                  c.accounts
                    .filter((a) => a.included)
                    .map((a) => (
                      <li key={a.id} className="flex justify-between gap-3">
                        <span className="truncate text-ink-2">
                          {a.name}
                          {a.mask ? ` ••${a.mask}` : ""}
                        </span>
                        <span className="tnum">{fmtMoney(a.type === "credit" ? -(a.currentBalance ?? 0) : (a.currentBalance ?? 0))}</span>
                      </li>
                    )),
                )}
              </ul>
            </div>

            <div className="card p-5 lg:col-span-3">
              <h2 className="text-sm font-bold">Is it profit?</h2>
              <p className="mt-1 text-sm text-ink-2">
                <ProfitSentence business={report.allTime.business} owner={owner} unsorted={report.allTime.unsorted} transfer={report.allTime.transfer} balance={report.balance} since={report.since} />
              </p>
              <dl className="mt-4 divide-y divide-border text-sm">
                <Line label={`Already in the account on ${report.since ? fmtDate(report.since, { month: "short", day: "numeric", year: "numeric" }) : "the first day"}`} value={report.opening} note="Your money before the history starts" />
                <Line label="Business cash profit" value={report.allTime.business} strong note="Payouts and other business income, minus everything the business paid" />
                <Line label="Your own money in and out" value={report.allTime.owner} note="Money you put in, minus personal spending and what you took out" />
                {report.allTime.transfer !== 0 && <Line label="Between your own accounts" value={report.allTime.transfer} note="Moved to or from an account that isn't counted here" />}
                {report.allTime.unsorted !== 0 && <Line label="Not sorted yet" value={report.allTime.unsorted} warn note="Sort these lines below to make the split exact" />}
                <div className="flex items-baseline justify-between gap-3 pt-2 font-bold">
                  <dt>In your bank now</dt>
                  <dd className="tnum">{fmtMoney(report.balance)}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* The chosen period. */}
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Money in" value={fmtMoney(report.period.moneyIn)} icon={ArrowDownLeft} tint="good" sub="Everything that came into the bank" />
            <KpiCard label="Money out" value={fmtMoney(report.period.moneyOut)} icon={ArrowUpRight} tint="orange" sub="Everything that left the bank" />
            <KpiCard label="Business cash profit" value={fmtMoney(report.period.byGroup.business)} raw={report.period.byGroup.business} featured sub="Business in minus business out" />
            <KpiCard label="Profit on the Dashboard" value={fmtMoney(metrics.totals.netProfit)} icon={Wallet} sub="From orders, costs and ads" />
          </div>

          <div className="card mt-4 p-4 sm:p-5">
            <h2 className="text-sm font-bold">Money in and out{report.period.weekly ? ", per week" : ", per day"}</h2>
            <div className="mt-3">
              <CashChart data={report.period.series} weekly={report.period.weekly} currency="USD" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="card overflow-hidden">
              <div className="px-4 pt-4 sm:px-5">
                <h2 className="text-sm font-bold">Where the money went · {range.label}</h2>
              </div>
              <table className="table mt-2">
                <tbody>
                  {(["business", "owner", "transfer", "unsorted"] as const).map((g) => {
                    const rows = report.period.byCategory.filter((c) => categoryGroup(c.category) === g);
                    if (rows.length === 0) return null;
                    return [
                      <tr key={g}>
                        <td colSpan={2} className="pt-4 text-xs font-semibold uppercase tracking-wide text-ink-3">
                          {g === "business" ? "Business" : g === "owner" ? "Your own money" : g === "transfer" ? "Between your accounts" : "Not sorted yet"}
                        </td>
                        <td className="pt-4 text-right text-xs font-semibold tnum text-ink-3">{signed(report.period.byGroup[g])}</td>
                      </tr>,
                      ...rows.map((c) => (
                        <tr key={c.category}>
                          <td>
                            {g === "unsorted" ? (
                              <Link href={`/cash?${pqs}show=unsorted#lines`} className="font-medium text-warn-text hover:underline">
                                {c.count} line{c.count === 1 ? "" : "s"} to sort
                              </Link>
                            ) : (
                              categoryLabel(c.category)
                            )}
                          </td>
                          <td className="text-right text-xs text-ink-3">{c.count}</td>
                          <td className="text-right tnum font-medium">{signed(c.amount)}</td>
                        </tr>
                      )),
                    ];
                  })}
                  {report.period.byCategory.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-sm text-ink-3">No bank transactions in this period.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {report.period.payoutsByStore.length > 0 && stores.length > 1 && (
                <div className="border-t border-border px-4 py-3 text-xs text-ink-2 sm:px-5">
                  Payouts by store:{" "}
                  {report.period.payoutsByStore.map((p, i) => (
                    <span key={p.storeId ?? "none"}>
                      {i > 0 && " · "}
                      {p.storeId ? (storeOf.get(p.storeId)?.name ?? "Store") : "not matched yet"} {fmtMoney(p.amount)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="card p-4 sm:p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <Clock className="h-4 w-4" /> Money still with Shopify
                </h2>
                <p className="mt-1 text-xs text-ink-3">Sales that are yours but haven&apos;t reached the bank yet.</p>
                <ul className="mt-3 divide-y divide-border text-sm">
                  {report.shopify.map((s) => (
                    <li key={s.storeId} className="py-2.5">
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                        {s.name}
                      </div>
                      {s.note ? (
                        <p className="mt-1 text-xs text-ink-3">{s.note === PAYOUT_SCOPES_NOTE ? <PayoutScopesHelp /> : s.note}</p>
                      ) : (
                        <dl className="mt-1 grid grid-cols-3 gap-2 text-xs">
                          <Mini label="Shopify balance" value={s.balance} />
                          <Mini label="Payout scheduled" value={s.scheduled} />
                          <Mini label="Paid, not in bank yet" value={s.onTheWay} />
                        </dl>
                      )}
                    </li>
                  ))}
                  {report.shopify.length === 0 && <li className="py-2 text-xs text-ink-3">No Shopify store is connected.</li>}
                </ul>
              </div>

              <div className="card p-4 text-sm text-ink-2 sm:p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Banknote className="h-4 w-4" /> Why bank money and profit differ
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  <li>Shopify pays out a few days after each sale, so this period&apos;s sales partly arrive in the next one.</li>
                  <li>Meta and suppliers charge when they bill you, not on the day of the order.</li>
                  <li>Your own money (what you put in, personal spending) is in the bank but is never profit.</li>
                  <li>Over a few months, business cash profit and Dashboard profit should land close together. A big gap means a cost is missing on one side.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* The lines themselves. */}
          <div id="lines" className="card mt-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
              <h2 className="text-sm font-bold">Bank transactions · {range.label}</h2>
              <div className="flex gap-1 text-xs">
                <Link href={`/cash?${pqs}#lines`} className={`rounded-full px-3 py-1.5 ${!onlyUnsorted ? "bg-ink font-bold text-surface" : "text-ink-2 hover:bg-surface-2"}`}>
                  All
                </Link>
                <Link href={`/cash?${pqs}show=unsorted#lines`} className={`rounded-full px-3 py-1.5 ${onlyUnsorted ? "bg-ink font-bold text-surface" : "text-ink-2 hover:bg-surface-2"}`}>
                  Not sorted ({report.period.unsortedCount})
                </Link>
              </div>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="text-right">Amount</th>
                    <th>Where it goes</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap text-ink-2">{fmtDate(t.date, { month: "short", day: "numeric" })}</td>
                      <td className="min-w-[200px]">
                        <div className="font-medium">{t.merchantName || t.name}</div>
                        <div className="text-[11px] text-ink-3">
                          {t.merchantName ? `${t.name} · ` : ""}
                          {t.account.name}
                          {t.account.mask ? ` ••${t.account.mask}` : ""}
                          {t.pending && " · pending"}
                          {t.payout && ` · Shopify payout of ${fmtDate(t.payout.issuedAt)}${storeOf.get(t.payout.storeId) && stores.length > 1 ? ` (${storeOf.get(t.payout.storeId)!.name})` : ""}`}
                          {t.category === "UNSORTED" && plaidHint(t.plaidCategory) && ` · Plaid's guess: ${plaidHint(t.plaidCategory)}`}
                        </div>
                      </td>
                      <td className={`whitespace-nowrap text-right tnum font-semibold ${t.pending ? "text-ink-3" : ""}`}>{signed(t.amount)}</td>
                      <td>
                        <TxCategory tx={{ id: t.id, category: t.category, storeId: t.storeId, ruleMatch: ruleMatchFor(t), locked: Boolean(t.payoutId) }} stores={stores} />
                      </td>
                    </tr>
                  ))}
                  {txs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-sm text-ink-3">
                        {onlyUnsorted ? "Everything in this period is sorted." : "No bank transactions in this period."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="card p-4 sm:p-5">
              <h2 className="text-sm font-bold">Connected bank</h2>
              {connections.map((c) => (
                <div key={c.id} className="mt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">{c.institutionName ?? "Bank"}</div>
                    <DisconnectBank id={c.id} name={c.institutionName ?? "this bank"} />
                  </div>
                  {c.historyStatus && c.historyStatus !== "HISTORICAL_UPDATE_COMPLETE" && (
                    <p className="mt-1 text-xs text-ink-3">Plaid is still bringing in your older history. It appears here on its own within a few hours.</p>
                  )}
                  <ul className="mt-2 space-y-2 text-sm">
                    {c.accounts.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-ink-2">
                          {a.name}
                          {a.mask ? ` ••${a.mask}` : ""} <span className="text-xs text-ink-3">{a.subtype}</span>
                        </span>
                        <AccountToggle id={a.id} included={a.included} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {configured && (
                <div className="mt-4 border-t border-border pt-3">
                  <PlaidButton label="Add another bank" primary={false} />
                </div>
              )}
            </div>

            <div className="card p-4 sm:p-5">
              <h2 className="text-sm font-bold">Your sorting rules</h2>
              <p className="mt-1 text-xs text-ink-3">Made when you choose “Always do this”. New lines with these names are sorted on their own.</p>
              <ul className="mt-2 divide-y divide-border text-sm">
                {rules.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span>
                      “{r.match}” {r.direction === "in" ? "coming in" : r.direction === "out" ? "going out" : ""} → <span className="font-medium">{categoryLabel(r.category)}</span>
                      {r.storeId && storeOf.get(r.storeId) ? ` · ${storeOf.get(r.storeId)!.name}` : ""}
                    </span>
                    <DeleteRule id={r.id} />
                  </li>
                ))}
                {rules.length === 0 && <li className="py-2 text-xs text-ink-3">No rules yet.</li>}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ProfitSentence({ business, owner, unsorted, transfer, balance, since }: { business: number; owner: number; unsorted: number; transfer: number; balance: number; since: Date | null }) {
  const when = since ? fmtDate(since, { month: "short", day: "numeric", year: "numeric" }) : "the start";
  const rest = owner + transfer;
  const tail = unsorted !== 0 ? ` ${fmtMoney(Math.abs(unsorted))} isn't sorted yet.` : "";
  if (business >= 0)
    return (
      <>
        Of the <b className="text-ink">{fmtMoney(balance)}</b> in your bank, <b className="text-good-text">{fmtMoney(business)}</b> is what the business has earned in cash since {when}. The rest,{" "}
        <b className="text-ink">{fmtMoney(rest)}</b>, is your own money.{tail}
      </>
    );
  return (
    <>
      Since {when} the business has paid out <b className="text-bad-text">{fmtMoney(-business)}</b> more than it brought in, so that part came from your own money. Your own money in the bank is{" "}
      <b className="text-ink">{fmtMoney(rest)}</b>.{tail}
    </>
  );
}

function Line({ label, value, note, strong, warn }: { label: string; value: number; note: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt>
        <span className={`${strong ? "font-semibold" : ""} ${warn ? "text-warn-text" : ""}`}>{label}</span>
        <span className="block text-[11px] text-ink-3">{note}</span>
      </dt>
      <dd className={`whitespace-nowrap tnum ${strong ? "font-semibold" : ""} ${warn ? "text-warn-text" : ""}`}>{signed(value)}</dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
      <dd className="tnum font-semibold text-ink">{value === null ? "—" : fmtMoney(value)}</dd>
    </div>
  );
}

function PayoutScopesHelp() {
  return (
    <>
      Payouts need two more permissions on this store&apos;s Shopify app. In dev.shopify.com open the app → Versions → New version, tick <b>read_shopify_payments_accounts</b> and{" "}
      <b>read_shopify_payments_payouts</b>, Release, then approve the update in the store. They appear here after the next sync.
    </>
  );
}

function SetupCard() {
  return (
    <div className="card mb-6 p-6">
      <h2 className="text-lg font-extrabold tracking-tight">Set up the bank connection (once, about 10 minutes)</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-2">Margin reads your bank through Plaid, read-only. Plaid&apos;s free trial covers up to 10 bank logins.</p>
      <ol className="mt-4 max-w-2xl list-decimal space-y-2 pl-5 text-sm">
        <li>Go to dashboard.plaid.com and create an account (choose the free Trial when asked).</li>
        <li>In Plaid: Developers → Keys. You&apos;ll need the client_id and the Production secret.</li>
        <li>
          In Vercel: project “metrics” → Settings → Environment Variables. Add <code>PLAID_CLIENT_ID</code>, <code>PLAID_SECRET</code> (the Production one) and <code>PLAID_ENV</code> with the value{" "}
          <code>production</code>. Then Deployments → Redeploy.
        </li>
        <li>Come back here: a “Connect your bank” button appears.</li>
      </ol>
      <p className="mt-3 text-xs text-ink-3">Paste the keys only into Vercel, never into a chat or email.</p>
    </div>
  );
}

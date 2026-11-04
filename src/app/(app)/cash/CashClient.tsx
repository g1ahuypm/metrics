"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { deleteRuleAction, disconnectBankAction, refreshCashAction, setAccountIncludedAction, setCategoryAction } from "@/lib/actions/cash";
import { CASH_CATEGORIES } from "@/lib/cash/categories";
import { fmtDate, fmtMoney } from "@/lib/format";

export function RefreshButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await refreshCashAction();
            setMsg(r.ok ? { ok: true, text: r.message ?? "Up to date." } : { ok: false, text: r.error });
          })
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
      </button>
      {msg && <span className={`max-w-xs text-right text-xs ${msg.ok ? "text-ink-3" : "text-bad-text"}`}>{msg.text}</span>}
    </span>
  );
}

type StoreChip = { id: string; name: string; color: string };

const GROUP_LABEL = { business: "Business", owner: "Your own money", transfer: "Other", unsorted: "Other" } as const;

/** One bank line: pick where it goes; afterwards offer to do the same for every line named like it. */
export function TxCategory({
  tx,
  stores,
}: {
  tx: { id: string; category: string; storeId: string | null; ruleMatch: string; locked: boolean };
  stores: StoreChip[];
}) {
  const [pending, start] = useTransition();
  const [category, setCategory] = useState(tx.category);
  const [storeId, setStoreId] = useState(tx.storeId ?? "");
  const [offer, setOffer] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const business = CASH_CATEGORIES.find((c) => c.key === category)?.group === "business";

  const save = (next: string, store: string, always: boolean) =>
    start(async () => {
      const r = await setCategoryAction(tx.id, next, store || null, always);
      setMsg(r.ok ? (always ? (r.message ?? null) : null) : r.error);
      setOffer(r.ok && !always);
    });

  return (
    <div className="flex min-w-[220px] flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          aria-label="Category"
          className={`input w-auto py-1 text-xs ${category === "UNSORTED" ? "border-warn text-warn-text" : ""}`}
          value={category}
          disabled={pending || tx.locked}
          onChange={(e) => {
            setCategory(e.target.value);
            save(e.target.value, storeId, false);
          }}
        >
          {(["business", "owner", "transfer"] as const).map((g) => (
            <optgroup key={g} label={GROUP_LABEL[g]}>
              {CASH_CATEGORIES.filter((c) => c.group === g || (g === "transfer" && c.group === "unsorted")).map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {business && stores.length > 1 && (
          <select
            aria-label="Store"
            className="input w-auto py-1 text-xs"
            value={storeId}
            disabled={pending || tx.locked}
            onChange={(e) => {
              setStoreId(e.target.value);
              save(category, e.target.value, false);
            }}
          >
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-3" />}
      </div>
      {offer && (
        <button type="button" className="self-start text-left text-xs font-semibold text-accent-text hover:underline" onClick={() => save(category, storeId, true)}>
          Always do this for “{tx.ruleMatch}”
        </button>
      )}
      {msg && <span className="text-xs text-ink-3">{msg}</span>}
    </div>
  );
}

export function AccountToggle({ id, included }: { id: string; included: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <input
        type="checkbox"
        checked={included}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            await setAccountIncludedAction(id, e.target.checked);
          })
        }
      />
      Count on this page
    </label>
  );
}

export function DisconnectBank({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-danger py-1 text-xs"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Disconnect ${name}? Margin stops reading it and forgets its transactions here. Your bank account itself is not affected.`)) return;
        start(async () => {
          await disconnectBankAction(id);
            });
      }}
    >
      Disconnect
    </button>
  );
}

export function DeleteRule({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-ghost px-2 py-1"
      aria-label="Delete rule"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await deleteRuleAction(id);
            })
      }
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/** Money in and out per day (or per week), side by side. Validated colours: --cash-in / --cash-out. */
export function CashChart({ data, weekly, currency }: { data: { date: string; moneyIn: number; moneyOut: number }[]; weekly: boolean; currency: string }) {
  // Up to one decimal, so $1,500 reads $1.5K (not a second "$2K") and $750 stays $750.
  const axis = new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
  const fmt = (v: number) => axis.format(v);
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="20%" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--ink-3)" }} tickFormatter={(v: string) => fmtDate(v, { month: "short", day: "numeric" })} minTickGap={16} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: "var(--ink-3)" }} tickFormatter={fmt} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
                  <div className="mb-1 font-medium text-ink">
                    {weekly ? "Week of " : ""}
                    {fmtDate(String(label), { weekday: weekly ? undefined : "short", month: "short", day: "numeric" })}
                  </div>
                  {payload.map((p) => (
                    <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
                      <span className="inline-flex items-center gap-1.5 text-ink-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: String(p.color) }} />
                        {p.name}
                      </span>
                      <span className="tnum font-medium text-ink">{fmtMoney(Number(p.value), currency)}</span>
                    </div>
                  ))}
                </div>
              ) : null
            }
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} />
          <Bar dataKey="moneyIn" name="Money in" fill="var(--cash-in)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="moneyOut" name="Money out" fill="var(--cash-out)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

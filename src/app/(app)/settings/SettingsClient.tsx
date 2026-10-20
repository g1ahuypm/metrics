"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Plus, RefreshCw, Unplug, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { addAdAccountAction, addStoreAction, disconnectAdAccountAction, setAdAccountStoresAction, updateAdAccountTokenAction } from "@/lib/actions/settings";
import type { FormState } from "@/lib/actions/auth";
import { changePasswordAction } from "@/lib/actions/team";
import { triggerSyncAction } from "@/lib/actions/sync";
import { CURRENCIES, TIMEZONES } from "@/lib/constants";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import type { SyncResult, SyncTarget } from "@/lib/sync";

type Field = { name: string; label: string; placeholder: string; defaultValue?: string; type?: string; optional?: boolean };

export function IntegrationCard({
  title,
  connect,
  disconnect,
  syncTarget,
  description,
  connected,
  identity,
  tokenHint,
  lastSync,
  fields,
  help,
}: {
  title: string;
  connect: (prev: FormState, formData: FormData) => Promise<FormState>;
  disconnect: () => Promise<void>;
  syncTarget: SyncTarget;
  description: string;
  connected: boolean;
  identity: string;
  tokenHint: string;
  lastSync: string;
  fields: Field[];
  help: string[];
}) {
  const source = syncTarget.source;
  const [state, formAction] = useActionState(connect, undefined);
  const [editing, setEditing] = useState(!connected);
  const [syncing, startSync] = useTransition();
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-ink-2">{description}</p>
        </div>
        <span className={`badge ${connected ? "text-good-text" : ""}`}>
          {connected ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {connected && !editing && (
        <div className="mt-4 rounded-xl bg-surface-2 p-3 text-xs">
          <div className="flex justify-between gap-2"><span className="text-ink-3">Account</span><span className="font-medium">{identity}</span></div>
          <div className="mt-1 flex justify-between gap-2"><span className="text-ink-3">Token</span><span className="font-mono">{tokenHint}</span></div>
          <div className="mt-1 flex justify-between gap-2"><span className="text-ink-3">Last sync</span><span>{lastSync}</span></div>
        </div>
      )}

      {syncResult && (
        <div className={`mt-3 ${syncResult.ok ? "alert-success" : "alert-error"}`}>{syncResult.message}</div>
      )}

      {connected && !editing ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={syncing}
            onClick={() => startSync(async () => setSyncResult(await triggerSyncAction(syncTarget)))}
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          {source === "shopify" && (
            <button
              type="button"
              className="btn-secondary"
              disabled={syncing}
              title="Re-import the last 60 days of orders from scratch. Use after changing how orders are priced."
              onClick={() => startSync(async () => setSyncResult(await triggerSyncAction(syncTarget, { full: true })))}
            >
              Full resync (60 days)
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
            Update credentials
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              if (confirm(`Disconnect ${title}? Synced data is kept.`)) startSync(() => disconnect());
            }}
          >
            <Unplug className="h-4 w-4" /> Disconnect
          </button>
        </div>
      ) : (
        <form action={formAction} className="mt-4 space-y-3">
          <FormMessage state={state} />
          {fields.map((f) => (
            <div key={f.name}>
              <label className="label" htmlFor={`${source}-${f.name}`}>{f.label}</label>
              <input
                id={`${source}-${f.name}`}
                name={f.name}
                type={f.type ?? "text"}
                className="input"
                placeholder={f.placeholder}
                defaultValue={f.defaultValue}
                autoComplete="off"
                required={!f.optional}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <SubmitButton pendingText="Testing connection…">Save & test connection</SubmitButton>
            {connected && (
              <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <details className="mt-4 text-xs">
        <summary className="cursor-pointer text-ink-2 hover:text-ink">How do I get these credentials?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-ink-2">
          {help.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}

export function StoreDetailsForm({
  save,
  store,
  colors,
}: {
  save: (prev: FormState, formData: FormData) => Promise<FormState>;
  store: { name: string; color: string; currency: string; timezone: string };
  colors: string[];
}) {
  const [state, action] = useActionState(save, undefined);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <div>
        <label className="label" htmlFor="store-name">Store name</label>
        <input id="store-name" name="name" defaultValue={store.name} required className="input" />
      </div>
      <fieldset>
        <legend className="label">Colour in the store switcher</legend>
        <div className="flex flex-wrap gap-2">
          {colors.map((c) => (
            <label key={c} className="cursor-pointer">
              <input type="radio" name="color" value={c} defaultChecked={store.color.toLowerCase() === c.toLowerCase()} className="peer sr-only" />
              <span className="block h-8 w-8 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent" style={{ background: c }}>
                <span className="sr-only">{c}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="store-currency">Currency</label>
          <select id="store-currency" name="currency" defaultValue={store.currency} className="input">
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="store-tz">Time zone</label>
          <select id="store-tz" name="timezone" defaultValue={store.timezone} className="input">
            {[...new Set([store.timezone, ...TIMEZONES])].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-ink-3">Currency and time zone are taken from Shopify on every sync.</p>
      <SubmitButton className="btn-secondary" pendingText="Saving…">Save</SubmitButton>
    </form>
  );
}

export function AddStoreForm() {
  const [state, action] = useActionState(addStoreAction, undefined);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add a store
      </button>
    );
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="label" htmlFor="new-store">Store name</label>
        <input id="new-store" name="name" required minLength={2} className="input" placeholder="e.g. Brightway Books" />
      </div>
      <SubmitButton pendingText="Adding…">Add store</SubmitButton>
      <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      {state && <div className="sm:basis-full"><FormMessage state={state} /></div>}
    </form>
  );
}

type StoreOption = { id: string; name: string; color: string };

export type AdAccountRow = {
  id: string;
  metaAccountId: string;
  name: string | null;
  connected: boolean;
  tokenHint: string;
  lastSync: string;
  storeIds: string[];
  campaigns: number;
  unlinked: number;
};

/** Meta ad accounts, and which stores advertise from each one. */
export function AdAccountsCard({ accounts, stores }: { accounts: AdAccountRow[]; stores: StoreOption[] }) {
  const [adding, setAdding] = useState(accounts.length === 0);
  return (
    <div className="card min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">Meta ad accounts</h2>
          <p className="mt-0.5 text-xs text-ink-2">
            Tick the stores that advertise from each account. With one store, all its spend counts for that store. With several, each campaign counts for
            the store whose product it&apos;s ticked on.
          </p>
        </div>
        {!adding && (
          <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add ad account
          </button>
        )}
      </div>
      <div className="mt-4 space-y-3">
        {accounts.map((a) => (
          <AdAccountItem key={a.id} account={a} stores={stores} />
        ))}
        {adding && <AddAdAccountForm stores={stores} reuse={accounts.some((a) => a.connected)} onCancel={accounts.length ? () => setAdding(false) : undefined} />}
      </div>
      <details className="mt-4 text-xs">
        <summary className="cursor-pointer text-ink-2 hover:text-ink">How do I get the ad account ID and token?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-ink-2">
          <li>Meta Business Settings → Users → System users → add a system user with access to the ad account(s).</li>
          <li>Generate a token with the ads_read permission (system-user tokens do not expire). One token can cover several ad accounts.</li>
          <li>Find the ad account ID in Ads Manager (the number after act= in the web address).</li>
        </ol>
      </details>
    </div>
  );
}

function AdAccountItem({ account: a, stores }: { account: AdAccountRow; stores: StoreOption[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState(new Set(a.storeIds));
  const [msg, setMsg] = useState<FormState>(undefined);
  const [pending, start] = useTransition();
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [editToken, setEditToken] = useState(false);
  const [tokenState, tokenAction] = useActionState(updateAdAccountTokenAction.bind(null, a.id), undefined);
  const dirty = picked.size !== a.storeIds.length || a.storeIds.some((id) => !picked.has(id));
  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return (
    <div className="rounded-2xl border border-border p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{a.name ?? a.metaAccountId}</div>
          <div className="text-xs text-ink-3">
            {a.metaAccountId} · {a.campaigns} campaign{a.campaigns === 1 ? "" : "s"} · last sync {a.lastSync}
          </div>
        </div>
        <span className={`badge ${a.connected ? "text-good-text" : ""}`}>
          {a.connected ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {a.connected ? "Connected" : "Not syncing"}
        </span>
      </div>
      <fieldset className="mt-3">
        <legend className="text-xs font-semibold text-ink-2">Stores that advertise from it</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {stores.map((s) => (
            <label key={s.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-sm has-[:checked]:border-ink has-[:checked]:bg-surface-2">
              <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="h-4 w-4 accent-[var(--accent)]" />
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      {picked.size > 1 && a.unlinked > 0 && (
        <p className="mt-2 text-xs text-warn-text">
          {a.unlinked} campaign{a.unlinked === 1 ? " isn't" : "s aren't"} linked to a store yet. Tick each one on its product page.
        </p>
      )}
      {msg && <div className="mt-2"><FormMessage state={msg} /></div>}
      {syncResult && <div className={`mt-2 ${syncResult.ok ? "alert-success" : "alert-error"}`}>{syncResult.message}</div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {dirty && (
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() => start(async () => { setMsg(await setAdAccountStoresAction(a.id, [...picked])); router.refresh(); })}
          >
            Save stores
          </button>
        )}
        {a.connected && (
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => start(async () => setSyncResult(await triggerSyncAction({ source: "meta", adAccountId: a.id })))}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync now
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={() => setEditToken((v) => !v)}>
          {a.connected ? "Update token" : "Reconnect"}
        </button>
        {a.connected && (
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              if (confirm("Stop syncing this ad account? Its campaigns and spend history are kept.")) start(async () => { await disconnectAdAccountAction(a.id); router.refresh(); });
            }}
          >
            <Unplug className="h-4 w-4" /> Disconnect
          </button>
        )}
      </div>
      {editToken && (
        <form action={tokenAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="label" htmlFor={`token-${a.id}`}>Access token {a.tokenHint && <span className="font-normal text-ink-3">(now {a.tokenHint})</span>}</label>
            <input id={`token-${a.id}`} name="token" type="password" className="input" placeholder="EAAB…" autoComplete="off" required />
          </div>
          <SubmitButton className="btn-secondary" pendingText="Testing…">Save & test</SubmitButton>
          {tokenState && <div className="sm:basis-full"><FormMessage state={tokenState} /></div>}
        </form>
      )}
    </div>
  );
}

function AddAdAccountForm({ stores, reuse, onCancel }: { stores: StoreOption[]; reuse: boolean; onCancel?: () => void }) {
  const [state, action] = useActionState(addAdAccountAction, undefined);
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-dashed border-border-strong p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="new-ad-account">Ad account ID</label>
          <input id="new-ad-account" name="adAccountId" required className="input" placeholder="act_123456789" autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="new-ad-token">
            Access token {reuse && <span className="font-normal text-ink-3">(leave empty to use the one you already connected)</span>}
          </label>
          <input id="new-ad-token" name="token" type="password" required={!reuse} className="input" placeholder="EAAB…" autoComplete="off" />
        </div>
      </div>
      <fieldset>
        <legend className="label">Stores that advertise from it</legend>
        <div className="flex flex-wrap gap-2">
          {stores.map((s) => (
            <label key={s.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-sm has-[:checked]:border-ink has-[:checked]:bg-surface-2">
              <input type="checkbox" name="storeIds" value={s.id} defaultChecked={stores.length === 1} className="h-4 w-4 accent-[var(--accent)]" />
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton pendingText="Testing connection…">Save & test connection</SubmitButton>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Current password</label>
          <input name="current" type="password" required className="input" autoComplete="current-password" />
        </div>
        <div>
          <label className="label">New password</label>
          <input name="next" type="password" required minLength={8} className="input" autoComplete="new-password" />
        </div>
      </div>
      <SubmitButton className="btn-secondary" pendingText="Updating…">Update password</SubmitButton>
    </form>
  );
}

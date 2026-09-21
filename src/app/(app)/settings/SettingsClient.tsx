"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, Loader2, RefreshCw, Unplug, XCircle } from "lucide-react";
import { connectMetaAction, connectShopifyAction, disconnectAction, updateGeneralSettingsAction } from "@/lib/actions/settings";
import { changePasswordAction } from "@/lib/actions/team";
import { triggerSyncAction } from "@/lib/actions/sync";
import { CURRENCIES, TIMEZONES } from "@/lib/constants";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import type { SyncResult } from "@/lib/sync";

type Field = { name: string; label: string; placeholder: string; defaultValue?: string; type?: string };

export function IntegrationCard({
  source,
  title,
  description,
  connected,
  identity,
  tokenHint,
  lastSync,
  fields,
  help,
}: {
  source: "shopify" | "meta";
  title: string;
  description: string;
  connected: boolean;
  identity: string;
  tokenHint: string;
  lastSync: string;
  fields: Field[];
  help: string[];
}) {
  const action = source === "shopify" ? connectShopifyAction : connectMetaAction;
  const [state, formAction] = useActionState(action, undefined);
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
        <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs">
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
            onClick={() => startSync(async () => setSyncResult(await triggerSyncAction(source)))}
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
            Update credentials
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              if (confirm(`Disconnect ${title}? Synced data is kept.`)) startSync(() => disconnectAction(source));
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
                required
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

export function GeneralSettingsForm({ settings }: { settings: { storeName: string; currency: string; timezone: string } }) {
  const [state, action] = useActionState(updateGeneralSettingsAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <div>
        <label className="label">Store name</label>
        <input name="storeName" defaultValue={settings.storeName} required className="input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Currency</label>
          <select name="currency" defaultValue={settings.currency} className="input">
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Timezone</label>
          <select name="timezone" defaultValue={settings.timezone} className="input">
            {TIMEZONES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <SubmitButton className="btn-secondary" pendingText="Saving…">Save</SubmitButton>
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

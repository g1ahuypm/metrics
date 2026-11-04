"use client";

import { useState, useTransition } from "react";
import { Landmark, Loader2 } from "lucide-react";
import { connectBankAction, createLinkTokenAction, reconnectedBankAction } from "@/lib/actions/cash";

type PlaidHandler = { open: () => void; destroy: () => void };
type PlaidLink = {
  create: (opts: {
    token: string;
    onSuccess: (publicToken: string, metadata: { institution?: { name?: string } | null }) => void;
    onExit: (err: { display_message?: string | null; error_message?: string } | null) => void;
  }) => PlaidHandler;
};

const SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

/** Plaid's own window, where the owner logs in to the bank. Loaded only when asked for. */
function loadPlaid(): Promise<PlaidLink> {
  const w = window as unknown as { Plaid?: PlaidLink };
  if (w.Plaid) return Promise.resolve(w.Plaid);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (w.Plaid ? resolve(w.Plaid) : reject(new Error("Plaid didn't load")));
    s.onerror = () => reject(new Error("Plaid couldn't be loaded. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

/** "Connect your bank", or with `reconnectId` "Log in to the bank again". */
export function PlaidButton({ reconnectId, label, primary = true }: { reconnectId?: string; label: string; primary?: boolean }) {
  const [opening, start] = useTransition();
  const [saving, setSaving] = useState(false);
  const pending = opening || saving;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Plaid's window runs outside React. The save's own answer carries the updated page (the action
  // revalidates /cash); an extra refresh on top would race it and the browser would cancel both.
  const finish = async (publicToken: string, institution: string | null) => {
    setSaving(true);
    setMsg({ ok: true, text: "Reading your accounts and history… this can take a minute." });
    const r = reconnectId ? await reconnectedBankAction(reconnectId) : await connectBankAction(publicToken, institution);
    setMsg(r.ok ? { ok: true, text: r.message ?? "Connected." } : { ok: false, text: r.error });
    setSaving(false);
  };

  const open = () =>
    start(async () => {
      setMsg(null);
      const t = await createLinkTokenAction(reconnectId);
      if (!t.token) return setMsg({ ok: false, text: t.error ?? "Plaid couldn't be started." });
      let plaid: PlaidLink;
      try {
        plaid = await loadPlaid();
      } catch (err) {
        return setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
      }
      const handler = plaid.create({
        token: t.token,
        onSuccess: (publicToken, metadata) => {
          handler.destroy();
          void finish(publicToken, metadata.institution?.name ?? null);
        },
        onExit: (err) => {
          if (err) setMsg({ ok: false, text: err.display_message || err.error_message || "The bank connection was not finished." });
          handler.destroy();
        },
      });
      handler.open();
    });

  return (
    <div className="space-y-2">
      <button type="button" className={primary ? "btn-primary" : "btn-secondary"} disabled={pending} onClick={open}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} {label}
      </button>
      {msg && <p className={`text-xs ${msg.ok ? "text-good-text" : "text-bad-text"}`}>{msg.text}</p>}
    </div>
  );
}

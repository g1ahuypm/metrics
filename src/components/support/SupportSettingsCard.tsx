"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { saveSupportSettingsAction } from "@/lib/actions/support";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";

export function SupportSettingsCard({
  email,
  connected,
  autoReply,
  signature,
  defaultSignature,
  aiReady,
  lastCheck,
}: {
  email: string | null;
  connected: boolean;
  autoReply: boolean;
  signature: string | null;
  defaultSignature: string;
  aiReady: boolean;
  lastCheck: string;
}) {
  const [state, action] = useActionState(saveSupportSettingsAction, undefined);
  // Controlled, so a failed attempt doesn't reset what was typed (forms reset after every action).
  const [address, setAddress] = useState(email ?? "learnwellsupport@gmail.com");
  const [auto, setAuto] = useState(autoReply);
  const [sig, setSig] = useState(signature ?? defaultSignature);
  return (
    <div id="support" className="card min-w-0 scroll-mt-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="h-4 w-4" /> Support inbox (Gmail)
          </h2>
          <p className="mt-1 text-xs text-ink-2">Your team reads and answers customer emails in Support, without logging in to Gmail.</p>
        </div>
        {connected ? (
          <span className="badge text-good-text">
            <CheckCircle2 className="h-3.5 w-3.5" /> Connected · checked {lastCheck}
          </span>
        ) : (
          <span className="badge text-warn-text">Not connected</span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form action={action} className="space-y-3">
          <FormMessage state={state} />
          <div>
            <label className="label" htmlFor="support-email">Support Gmail address</label>
            <input id="support-email" name="email" type="email" className="input" value={address} onChange={(e) => setAddress(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="support-password">Google app password</label>
            <input
              id="support-password"
              name="password"
              type="password"
              autoComplete="off"
              className="input"
              placeholder={connected ? "Saved. Paste a new one only to replace it" : "16 letters, e.g. abcd efgh ijkl mnop"}
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="autoReply" className="mt-0.5" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <span>
              <strong className="font-medium">AI replies on its own.</strong>{" "}
              <span className="text-ink-2">
                When it is sure and the topic allows it. Angry customers, chargebacks and anything unusual always wait for a person.
              </span>
            </span>
          </label>
          <div>
            <label className="label" htmlFor="support-signature">Signature at the end of every reply</label>
            <textarea id="support-signature" name="signature" className="input min-h-[120px]" value={sig} onChange={(e) => setSig(e.target.value)} />
          </div>
          <SubmitButton className="btn-primary" pendingText="Connecting…">
            {connected ? "Save" : "Connect"}
          </SubmitButton>
          {!aiReady && (
            <p className="text-xs text-warn-text">
              The AI is not set up yet: add ANTHROPIC_API_KEY in Vercel (steps on the right). Until then emails arrive but are not sorted or answered.
            </p>
          )}
        </form>

        <div className="space-y-3 text-sm">
          <div>
            <div className="mb-1 font-medium">Get the app password (5 minutes)</div>
            <ol className="list-decimal space-y-1 pl-5 text-ink-2">
              <li>Sign in to Google as the support address, and open myaccount.google.com/security.</li>
              <li>Turn on <strong className="font-medium text-ink">2-Step Verification</strong> (Google requires it for app passwords).</li>
              <li>Open myaccount.google.com/apppasswords, type the name “LearnWell dashboard” and click Create.</li>
              <li>Copy the 16 letters Google shows, paste them in the box on the left, and click Connect.</li>
            </ol>
            <p className="mt-1 text-xs text-ink-3">Paste it only into this page, never into a chat or email. You can remove it any time from the same Google page.</p>
          </div>
          <div>
            <div className="mb-1 font-medium">Turn on the AI (once)</div>
            <ol className="list-decimal space-y-1 pl-5 text-ink-2">
              <li>Go to console.anthropic.com, sign in, add a payment method under Billing.</li>
              <li>API keys → Create key, name it “LearnWell support”, copy it.</li>
              <li>Vercel → project “metrics” → Settings → Environment Variables → add <code className="text-xs">ANTHROPIC_API_KEY</code> with that key → Save, then Deployments → Redeploy.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

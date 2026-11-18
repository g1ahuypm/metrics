"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ExternalLink, Loader2, Mail, Plus, RefreshCw, X } from "lucide-react";
import {
  addPlannedRefundAction,
  checkRefundsNowAction,
  draftRefundEmailAction,
  removePlannedRefundAction,
  saveRefundClosingAction,
  setReturnStatusAction,
} from "@/lib/actions/refunds";
import { RETURN_CHOICES, type ReturnChoice } from "@/lib/refunds/email";
import type { FormState } from "@/lib/actions/auth";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";

export function CheckRefundsButton({ storeIds }: { storeIds: string[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<FormState>(undefined);
  return (
    <div className="flex items-center gap-2">
      {msg && <span className={`text-xs ${msg.error ? "text-bad-text" : "text-good-text"}`}>{msg.error ?? msg.success}</span>}
      <button type="button" className="btn-secondary" disabled={pending} onClick={() => start(async () => setMsg(await checkRefundsNowAction(storeIds)))}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check Shopify now
      </button>
    </div>
  );
}

type Planned = { id: string; orderName: string; note: string | null; addedBy: string | null; done: boolean; added: string };

/** Refunds the team still has to make in Shopify. */
export function PlannedRefunds({ storeId, editor, items }: { storeId: string | null; editor: boolean; items: Planned[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold">Refunds still to make</h2>
      <p className="mt-1 text-xs text-ink-2">Add an order you&apos;ve promised to refund. It&apos;s ticked off by itself once the refund shows up in Shopify.</p>
      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {items.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className={`min-w-0 ${p.done ? "text-ink-3 line-through" : ""}`}>
                <strong className="font-semibold">{p.orderName}</strong>
                {p.note ? ` · ${p.note}` : ""}
                <span className="ml-1 text-xs text-ink-3 no-underline">
                  {p.done ? "· done in Shopify" : `· added ${p.added}${p.addedBy ? ` by ${p.addedBy}` : ""}`}
                </span>
              </span>
              {editor && !p.done && (
                <button type="button" className="btn-ghost py-1 text-xs" disabled={pending} onClick={() => start(() => removePlannedRefundAction(p.id))} aria-label={`Remove ${p.orderName}`}>
                  <X className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editor && storeId && <AddPlanned storeId={storeId} />}
      {editor && !storeId && <p className="mt-3 text-xs text-ink-3">Pick a store above to add one.</p>}
    </div>
  );
}

function AddPlanned({ storeId }: { storeId: string }) {
  const [state, action] = useActionState(addPlannedRefundAction.bind(null, storeId), undefined);
  return (
    <>
      <form action={action} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="sm:w-40">
          <label className="label" htmlFor="pr-order">Order number</label>
          <input id="pr-order" name="orderName" className="input" placeholder="#LW001473" />
        </div>
        <div className="flex-1">
          <label className="label" htmlFor="pr-note">Note (optional)</label>
          <input id="pr-note" name="note" className="input" placeholder="e.g. paperback complaint, full refund agreed" />
        </div>
        <SubmitButton className="btn-secondary">
          <Plus className="h-4 w-4" /> Add
        </SubmitButton>
      </form>
      <FormMessage state={state} />
    </>
  );
}

type RefundRow = { id: string; status: string; hasEmail: boolean; returnStatus: string | null; threadId: string | null; drafted: boolean; sentAt: string | null };

const RETURN_LABEL: Record<string, string> = {
  needed: "Return instructions to send",
  instructions_sent: "Instructions sent · waiting for the items",
  received: "Items received",
  not_needed: "No return",
};

/** The follow-up for one refund: the customer's email, then getting the items back. */
export function RefundActions({ editor, refund: r }: { editor: boolean; refund: RefundRow }) {
  const [pending, start] = useTransition();
  const [choosing, setChoosing] = useState(false);
  const [choice, setChoice] = useState<ReturnChoice>("needed");
  const [msg, setMsg] = useState<string | null>(null);

  const email = r.sentAt ? (
    <span className="inline-flex items-center gap-1 text-xs text-good-text">
      <Check className="h-3.5 w-3.5" /> Email sent {r.sentAt}
    </span>
  ) : r.drafted && r.threadId ? (
    <Link href={`/support/${r.threadId}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
      Email drafted · open in Support <ExternalLink className="h-3 w-3" />
    </Link>
  ) : r.status !== "processed" ? (
    <span className="text-xs text-ink-3">{r.status === "failed" ? "Refund failed in Shopify" : "Email once Shopify shows it processed"}</span>
  ) : !r.hasEmail ? (
    <span className="text-xs text-ink-3">No customer email on this order</span>
  ) : editor && !choosing ? (
    <button type="button" className="btn-secondary py-1.5 text-sm" onClick={() => setChoosing(true)}>
      <Mail className="h-4 w-4" /> Write refund email
    </button>
  ) : (
    <span className="text-xs text-warn-text">Customer not emailed yet</span>
  );

  return (
    <div className="flex shrink-0 flex-col gap-2 lg:w-80 lg:items-end">
      {email}
      {choosing && (
        <div className="w-full rounded-xl border border-border p-3 text-sm">
          <div className="mb-1 text-xs font-medium text-ink-2">Do the items come back?</div>
          {RETURN_CHOICES.map((c) => (
            <label key={c.value} className="flex items-start gap-2 py-0.5 text-xs">
              <input type="radio" name={`ret-${r.id}`} className="mt-0.5" checked={choice === c.value} onChange={() => setChoice(c.value)} />
              {c.label}
            </label>
          ))}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn-primary py-1.5 text-sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await draftRefundEmailAction(r.id, choice);
                  setMsg(res?.error ?? null);
                  if (!res?.error) setChoosing(false);
                })
              }
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Write the draft
            </button>
            <button type="button" className="btn-ghost py-1.5 text-sm" disabled={pending} onClick={() => setChoosing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && <span className="text-xs text-bad-text">{msg}</span>}
      {r.returnStatus && <span className="text-xs text-ink-2">{RETURN_LABEL[r.returnStatus] ?? r.returnStatus}</span>}
      {editor && (r.returnStatus === "needed" || r.returnStatus === "instructions_sent") && (
        <div className="flex flex-wrap gap-1 lg:justify-end">
          {r.returnStatus === "needed" && (
            <button type="button" className="btn-ghost py-1 text-xs" disabled={pending} onClick={() => start(() => setReturnStatusAction(r.id, "instructions_sent"))}>
              <Check className="h-3.5 w-3.5" /> Instructions sent
            </button>
          )}
          <button type="button" className="btn-ghost py-1 text-xs" disabled={pending} onClick={() => start(() => setReturnStatusAction(r.id, "received"))}>
            <Check className="h-3.5 w-3.5" /> Items received
          </button>
        </div>
      )}
    </div>
  );
}

/** The store's own last paragraph (apology, coupon, what's new). */
export function ClosingForm({ storeId, storeName, closing }: { storeId: string; storeName: string; closing: string }) {
  const [state, action] = useActionState(saveRefundClosingAction.bind(null, storeId), undefined);
  const [text, setText] = useState(closing);
  return (
    <form action={action} className="card min-w-0 p-4">
      <h2 className="text-sm font-semibold">{storeName}: last paragraph of refund emails</h2>
      <p className="mt-1 text-xs text-ink-2">The apology and anything you want to offer (a coupon code, what&apos;s new). It goes at the end of every refund email.</p>
      <textarea name="closing" className="input mt-3 min-h-[120px] leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} />
      <div className="mt-3 flex items-center gap-3">
        <SubmitButton className="btn-primary">Save</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

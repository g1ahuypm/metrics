"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Send, Sparkles, UserCheck, UserX } from "lucide-react";
import { draftWithAiAction, sendSupportReplyAction, setThreadCategoryAction, setThreadStatusAction } from "@/lib/actions/support";

export function ReplyPanel({
  threadId,
  category,
  status,
  draft,
  blank,
  holdReason,
  actionNote,
}: {
  threadId: string;
  category: string;
  status: string;
  draft: string | null;
  blank: string;
  holdReason: string | null;
  actionNote: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(draft ?? blank);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMsg(null);
    start(async () => {
      await fn();
      setBusy(null);
      router.refresh();
    });
  }

  if (category === "other") {
    return (
      <div className="card flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="text-ink-2">Sorted as not a customer, so nobody replies to it.</span>
        <button type="button" className="btn-secondary py-1.5 text-sm" disabled={pending} onClick={() => run("cat", () => setThreadCategoryAction(threadId, "customer"))}>
          {busy === "cat" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
          It is a customer
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4">
      {actionNote && (
        <div className="mb-3 flex flex-col gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>
            <strong className="font-medium">To do:</strong> {actionNote}
          </span>
          <button type="button" className="btn-secondary py-1 text-xs" disabled={pending} onClick={() => run("done", () => setThreadStatusAction(threadId, "done"))}>
            {busy === "done" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Done
          </button>
        </div>
      )}
      {holdReason && <p className="mb-2 text-xs text-warn-text">Not sent automatically: {holdReason}. Check the reply below, then send it.</p>}
      <label htmlFor="reply" className="mb-1 block text-xs font-medium text-ink-2">
        Reply to the customer
      </label>
      <textarea id="reply" className="input min-h-[260px] font-[inherit] leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-good-text" : "text-bad-text"}`}>{msg.text}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={pending || text.trim() === blank.trim()}
          onClick={() =>
            run("send", async () => {
              const r = await sendSupportReplyAction(threadId, text);
              setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: "Sent from the support Gmail" });
            })
          }
        >
          {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() =>
            run("ai", async () => {
              const r = await draftWithAiAction(threadId);
              if (r?.draft) setText(r.draft);
              setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: "The AI wrote a new draft. Check it, then send." });
            })
          }
        >
          {busy === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {draft ? "Rewrite with AI" : "Write with AI"}
        </button>
        <span className="flex-1" />
        {status !== "done" && (
          <button type="button" className="btn-ghost text-sm" disabled={pending} onClick={() => run("done", () => setThreadStatusAction(threadId, "done"))}>
            <Check className="h-4 w-4" /> Mark done
          </button>
        )}
        <button type="button" className="btn-ghost text-sm" disabled={pending} onClick={() => run("cat", () => setThreadCategoryAction(threadId, "other"))}>
          <UserX className="h-4 w-4" /> Not a customer
        </button>
      </div>
    </div>
  );
}

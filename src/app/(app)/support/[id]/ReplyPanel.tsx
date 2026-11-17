"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Check, ListTodo, Loader2, Pencil, Send, Sparkles, UserCheck, UserX, X } from "lucide-react";
import { draftWithAiAction, removeTodoAction, saveTodoAction, sendSupportReplyAction, setThreadCategoryAction, setThreadStatusAction } from "@/lib/actions/support";

export type TodoInfo = { note: string | null; urgent: boolean; by: string; since: string };

export function ReplyPanel({
  threadId,
  category,
  status,
  draft,
  blank,
  holdReason,
  draftReady,
  afterSending,
  actionNote,
  todo,
  urgent,
}: {
  threadId: string;
  category: string;
  status: string;
  draft: string | null;
  blank: string;
  holdReason: string | null;
  draftReady: boolean;
  afterSending: string | null;
  actionNote: string | null;
  todo: TodoInfo | null;
  urgent: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(draft ?? blank);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [todoForm, setTodoForm] = useState(false);
  const [todoNote, setTodoNote] = useState(todo?.note ?? "");
  const [todoUrgent, setTodoUrgent] = useState(todo?.urgent ?? urgent);

  function openTodoForm() {
    setTodoNote(todo?.note ?? "");
    setTodoUrgent(todo?.urgent ?? urgent);
    setTodoForm(true);
  }

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

  const form = todoForm && (
    <div className="mb-3 rounded-xl border border-accent/40 bg-accent-soft/50 p-3">
      <label htmlFor="todo-note" className="mb-1 block text-xs font-medium text-ink-2">
        What&apos;s left to do? (optional)
      </label>
      <input
        id="todo-note"
        className="input"
        value={todoNote}
        maxLength={300}
        autoFocus
        placeholder="e.g. Send a photo of the puzzle packet"
        onChange={(e) => setTodoNote(e.target.value)}
      />
      <label className="mt-2 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={todoUrgent} onChange={(e) => setTodoUrgent(e.target.checked)} />
        <span>
          Urgent: remind me every day until it&apos;s answered
          <span className="block text-xs text-ink-3">For upset customers. Everything else just waits on the list.</span>
        </span>
      </label>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn-primary py-1.5 text-sm"
          disabled={pending}
          onClick={() =>
            run("todo", async () => {
              const r = await saveTodoAction(threadId, { note: todoNote, urgent: todoUrgent });
              setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: r?.success ?? "Saved" });
              if (!r?.error) setTodoForm(false);
            })
          }
        >
          {busy === "todo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListTodo className="h-4 w-4" />} {todo ? "Save" : "Add to To do"}
        </button>
        <button type="button" className="btn-ghost py-1.5 text-sm" disabled={pending} onClick={() => setTodoForm(false)}>
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="card p-4">
      {todo && !todoForm && (
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent-soft/50 px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <ListTodo className="h-4 w-4 text-accent" />
              <strong className="font-medium">On To do</strong>
              {todo.urgent && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-bad-text">
                  <BellRing className="h-3.5 w-3.5" /> Urgent: daily reminder
                </span>
              )}
            </div>
            {todo.note && <p className="mt-1 break-words">{todo.note}</p>}
            <p className="mt-0.5 text-xs text-ink-3">
              {todo.by} · {todo.since}. It comes off the list when someone sends a reply or marks it done.
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" className="btn-secondary py-1 text-xs" disabled={pending} onClick={openTodoForm}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button type="button" className="btn-ghost py-1 text-xs" disabled={pending} onClick={() => run("untodo", () => removeTodoAction(threadId))}>
              {busy === "untodo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Remove
            </button>
          </div>
        </div>
      )}
      {form}
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
      {holdReason && (
        <p className="mb-2 text-xs text-warn-text">
          <strong className="font-semibold">Needs a decision:</strong> {holdReason.replace(/\.$/, "")}. Fix the draft below if needed, then send it.
        </p>
      )}
      {draftReady && <p className="mb-2 text-xs text-good-text">The AI&apos;s draft is ready. Read it, then send it.</p>}
      {afterSending && (
        <p className="mb-2 text-xs text-ink-2">
          <strong className="font-semibold text-ink">After sending:</strong> {afterSending}
        </p>
      )}
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
        {!todo && !todoForm && status !== "done" && (
          <button type="button" className="btn-ghost text-sm" disabled={pending} onClick={openTodoForm}>
            <ListTodo className="h-4 w-4" /> To do
          </button>
        )}
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

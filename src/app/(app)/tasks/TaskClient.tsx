"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, Clock, Trash2, RotateCcw } from "lucide-react";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import {
  answerMoreTimeAction,
  completeTaskAction,
  deleteTaskAction,
  postTaskUpdateAction,
  reopenTaskAction,
  requestMoreTimeAction,
  saveTaskAction,
} from "@/lib/actions/tasks";
import type { FormState } from "@/lib/actions/auth";
import { PRIORITIES } from "@/lib/tasks/due";

export type Member = { id: string; name: string; timeZone: string | null };

export type TaskFormValues = {
  id?: string;
  title: string;
  details: string;
  doneMeans: string;
  assigneeId: string;
  dueDate: string;
  dueTime: string;
  priority: string;
  link: string;
  storeId: string;
};

const PRIORITY_STYLE: Record<string, string> = {
  normal: "peer-checked:bg-surface-2 peer-checked:border-border-strong peer-checked:text-ink",
  high: "peer-checked:bg-warn/15 peer-checked:border-warn/60 peer-checked:text-warn-text",
  urgent: "peer-checked:bg-bad/10 peer-checked:border-bad/50 peer-checked:text-bad-text",
};

function zoneName(tz: string): string {
  return tz.split("/").pop()!.replace(/_/g, " ");
}

/** Create or edit a task. Every field that makes a task specific is required. */
export function TaskForm({
  members,
  values,
  today,
  myTimeZone,
  stores,
}: {
  members: Member[];
  values: TaskFormValues;
  today: string;
  myTimeZone: string;
  stores: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(saveTaskAction, undefined);
  const [assigneeId, setAssigneeId] = useState(values.assigneeId);
  const assignee = members.find((m) => m.id === assigneeId);
  const zone = assignee?.timeZone ?? myTimeZone;

  return (
    <form action={action} className="space-y-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div>
        <label className="label" htmlFor="title">Task</label>
        <input id="title" name="title" className="input" defaultValue={values.title} maxLength={120} required placeholder="e.g. Reply to the 3 refund emails in Support" />
        <p className="mt-1 text-xs text-ink-3">Start with a verb. One clear thing to do.</p>
      </div>
      <div>
        <label className="label" htmlFor="details">Details</label>
        <textarea id="details" name="details" className="input min-h-28" defaultValue={values.details} required placeholder="Which orders, which product, where to find things, who to ask…" />
      </div>
      <div>
        <label className="label" htmlFor="doneMeans">Done means</label>
        <textarea id="doneMeans" name="doneMeans" className="input min-h-20" defaultValue={values.doneMeans} required placeholder="e.g. All 3 customers have a reply and the refunds are made in Shopify" />
        <p className="mt-1 text-xs text-ink-3">How you&apos;ll both know it&apos;s finished.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="assigneeId">Assigned to</label>
          <select id="assigneeId" name="assigneeId" className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} required>
            <option value="" disabled>Choose a person</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">Priority</span>
          <div className="grid grid-cols-3 gap-1.5">
            {PRIORITIES.map((p) => (
              <label key={p.key} className="cursor-pointer">
                <input type="radio" name="priority" value={p.key} defaultChecked={values.priority === p.key} className="peer sr-only" />
                <span className={`block rounded-xl border border-border px-2 py-2 text-center text-sm text-ink-2 peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 ${PRIORITY_STYLE[p.key]}`}>
                  {p.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="grid grid-cols-[1fr_auto] gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="dueDate">Due date</label>
            <input id="dueDate" name="dueDate" type="date" className="input" defaultValue={values.dueDate} min={values.id ? undefined : today} required />
          </div>
          <div>
            <label className="label" htmlFor="dueTime">Time <span className="font-normal text-ink-3">(optional)</span></label>
            <input id="dueTime" name="dueTime" type="time" className="input" defaultValue={values.dueTime} />
          </div>
        </div>
        <p className="mt-1 text-xs text-ink-3">
          {assignee
            ? assignee.timeZone
              ? `In ${assignee.name}'s time (${zoneName(zone)}). No time means by the end of that day.`
              : `${assignee.name} hasn't opened the dashboard yet, so your time zone (${zoneName(zone)}) is used. No time means by the end of that day.`
            : "No time means by the end of that day."}
        </p>
      </div>

      {stores.length > 1 && (
        <div>
          <label className="label" htmlFor="storeId">Store <span className="font-normal text-ink-3">(optional)</span></label>
          <select id="storeId" name="storeId" className="input" defaultValue={values.storeId}>
            <option value="">Not about one store</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}
      {stores.length <= 1 && <input type="hidden" name="storeId" value={values.storeId} />}

      <div>
        <label className="label" htmlFor="link">Link <span className="font-normal text-ink-3">(optional)</span></label>
        <input id="link" name="link" className="input" defaultValue={values.link} placeholder="An order, a product page, a support email, a Google Doc…" />
      </div>

      <FormMessage state={state} />
      <div className="flex items-center gap-2">
        <SubmitButton pendingText="Saving…">{values.id ? "Save changes" : "Create task"}</SubmitButton>
        {!values.id && <span className="text-xs text-ink-3">{assignee ? `${assignee.name} is notified right away.` : ""}</span>}
      </div>
    </form>
  );
}

function useResetOnSuccess(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) ref.current?.reset();
  }, [state]);
  return ref;
}

export function PostUpdateForm({ taskId, placeholder }: { taskId: string; placeholder: string }) {
  const [state, action] = useActionState(postTaskUpdateAction.bind(null, taskId), undefined);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <textarea name="text" className="input min-h-20" placeholder={placeholder} required />
      {state?.error && <FormMessage state={state} />}
      <SubmitButton className="btn-secondary" pendingText="Posting…">Post update</SubmitButton>
    </form>
  );
}

export function DoneForm({ taskId, doneMeans }: { taskId: string; doneMeans: string }) {
  const [state, action] = useActionState(completeTaskAction.bind(null, taskId), undefined);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn-primary w-full" onClick={() => setOpen(true)}>
        <Check className="h-4 w-4" /> Mark as done
      </button>
    );
  return (
    <form action={action} className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-xs text-ink-2">
        <span className="font-medium text-ink">Check first:</span> {doneMeans}
      </p>
      <textarea name="note" className="input min-h-16" placeholder="Note for the team (optional): what you did, where to find it" />
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton pendingText="Saving…">
          <Check className="h-4 w-4" /> Yes, it&apos;s done
        </SubmitButton>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function MoreTimeForm({ taskId, minDate }: { taskId: string; minDate: string }) {
  const [state, action] = useActionState(requestMoreTimeAction.bind(null, taskId), undefined);
  const [open, setOpen] = useState(false);
  if (state?.success) return <FormMessage state={state} />;
  if (!open)
    return (
      <button type="button" className="btn-secondary w-full" onClick={() => setOpen(true)}>
        <Clock className="h-4 w-4" /> Ask for more time
      </button>
    );
  return (
    <form action={action} className="space-y-2 rounded-xl border border-border p-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label className="label" htmlFor="mt-date">New date</label>
          <input id="mt-date" name="date" type="date" className="input" min={minDate} required />
        </div>
        <div>
          <label className="label" htmlFor="mt-time">Time</label>
          <input id="mt-time" name="time" type="time" className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="mt-reason">Why</label>
        <textarea id="mt-reason" name="reason" className="input min-h-16" placeholder="e.g. Waiting for the supplier's reply" required />
      </div>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton className="btn-secondary" pendingText="Sending…">Send request</SubmitButton>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function AnswerMoreTime({ taskId }: { taskId: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>(undefined);
  const answer = (approve: boolean) => start(async () => setState(await answerMoreTimeAction(taskId, approve)));
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button type="button" className="btn-primary" disabled={pending} onClick={() => answer(true)}>Approve</button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => answer(false)}>Decline</button>
      </div>
      {state?.error && <FormMessage state={state} />}
    </div>
  );
}

export function ReopenButton({ taskId }: { taskId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn-secondary w-full" disabled={pending} onClick={() => start(() => reopenTaskAction(taskId))}>
      <RotateCcw className="h-4 w-4" /> Reopen task
    </button>
  );
}

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-danger"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this task and its updates? This can't be undone.")) start(() => deleteTaskAction(taskId));
      }}
    >
      <Trash2 className="h-4 w-4" /> Delete
    </button>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bell, CheckCircle2, Clock, ExternalLink, MessageSquare, Pencil, PlusCircle, RotateCcw, UserRound, XCircle } from "lucide-react";
import { canManageTasks, requireSignedIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettingsRow } from "@/lib/integrations/config";
import { validTimezone } from "@/lib/scope";
import { fmtDateTime } from "@/lib/format";
import { dueGroup, dueLabel, fmtDue } from "@/lib/tasks/due";
import { PriorityBadge } from "@/components/tasks/PriorityBadge";
import { AnswerMoreTime, DoneForm, MoreTimeForm, PostUpdateForm, ReopenButton } from "../TaskClient";

const KIND_ICON: Record<string, typeof Bell> = {
  created: PlusCircle,
  comment: MessageSquare,
  edited: Pencil,
  reassigned: UserRound,
  due_changed: Clock,
  extension_requested: Clock,
  extension_approved: CheckCircle2,
  extension_declined: XCircle,
  done: CheckCircle2,
  reopened: RotateCcw,
  reminder: Bell,
};

const KIND_TEXT: Record<string, string> = {
  created: "created the task",
  comment: "posted an update",
  edited: "edited the task",
  reassigned: "reassigned the task",
  due_changed: "changed the due date",
  extension_requested: "asked for more time",
  extension_approved: "approved more time",
  extension_declined: "declined more time",
  done: "marked it done",
  reopened: "reopened the task",
};

function zoneName(tz: string): string {
  return tz.split("/").pop()!.replace(/_/g, " ");
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSignedIn();
  const { id } = await params;
  const [task, settings] = await Promise.all([
    db.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        updates: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } } } },
      },
    }),
    getSettingsRow(),
  ]);
  const manager = canManageTasks(me.role);
  if (!task || (task.assigneeId !== me.id && task.createdById !== me.id && !manager)) notFound();
  // Opening the task counts as reading its inbox items.
  await db.notification.updateMany({ where: { userId: me.id, taskId: id, readAt: null }, data: { readAt: new Date() } });

  const myTz = validTimezone(me.timeZone ?? settings.timezone);
  const isAssignee = task.assigneeId === me.id;
  const open = task.status === "open";
  const now = new Date();
  const group = dueGroup(task, now);
  const otherZone = task.dueTimeZone !== myTz;

  return (
    <div>
      <Link href="/tasks" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Tasks
      </Link>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {open ? (
              <span className={`badge ${group === "overdue" ? "border-bad/40 bg-bad/10 text-bad-text" : group === "today" ? "border-warn/50 bg-warn/10 text-warn-text" : ""}`}>
                {dueLabel(task, now)}
              </span>
            ) : (
              <span className="badge border-good/40 bg-good/10 text-good-text">
                <CheckCircle2 className="h-3 w-3" /> Done
              </span>
            )}
            <PriorityBadge priority={task.priority} always />
          </div>
          <h1 className="text-[28px] font-extrabold tracking-tight">{task.title}</h1>
        </div>
        {manager && (
          <Link href={`/tasks/${id}/edit`} className="btn-secondary shrink-0 self-start">
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-4 sm:p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">What to do</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{task.details}</p>
            {task.link && (
              <a href={task.link} target={task.link.startsWith("/") ? undefined : "_blank"} rel="noreferrer" className="mt-3 inline-flex max-w-full items-center gap-1.5 text-sm text-accent hover:underline">
                <ExternalLink className="h-4 w-4 shrink-0" />
                <span className="truncate">{task.link.replace(/^https?:\/\//, "")}</span>
              </a>
            )}
          </div>
          <div className="card border-accent/30 bg-accent-soft/40 p-4 sm:p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-accent">Done means</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{task.doneMeans}</p>
          </div>

          <div className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Updates</h2>
            <ol className="mt-3 space-y-3">
              {task.updates.map((u) => {
                const Icon = KIND_ICON[u.kind] ?? MessageSquare;
                const who = u.user?.name ?? (u.kind === "reminder" ? "" : "Someone");
                return (
                  <li key={u.id} className="flex gap-3">
                    <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${u.kind === "done" || u.kind === "extension_approved" ? "bg-good/15 text-good-text" : u.kind === "reminder" ? "bg-surface-2 text-ink-3" : "bg-accent-soft text-accent"}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-ink-3">
                        {u.kind !== "reminder" && <span className="font-medium text-ink-2">{who} </span>}
                        {u.kind === "reminder" ? u.text : KIND_TEXT[u.kind] ?? u.kind}
                        <span> · {fmtDateTime(u.createdAt, myTz)}</span>
                      </div>
                      {u.kind !== "reminder" && u.text && <p className={`mt-0.5 whitespace-pre-wrap text-sm ${u.kind === "comment" || u.kind === "done" ? "" : "text-ink-2"}`}>{u.text}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 border-t border-border pt-4">
              <PostUpdateForm
                taskId={id}
                placeholder={isAssignee ? "How is it going? Anything blocking you?" : `Write to ${task.assignee.name}…`}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-ink-3">Assigned to</dt>
                <dd className="font-medium">{isAssignee ? `${task.assignee.name} (you)` : task.assignee.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Due</dt>
                <dd className="font-medium">{task.dueTime ? fmtDue(task.dueDate, task.dueTime, true) : `${fmtDue(task.dueDate, null, true)}, end of day`}</dd>
                {otherZone && (
                  <dd className="text-xs text-ink-3">
                    {isAssignee ? "Your" : `${task.assignee.name}'s`} time ({zoneName(task.dueTimeZone)}). For you: {fmtDateTime(task.dueAt, myTz)}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-xs text-ink-3">Created by</dt>
                <dd>
                  {task.createdBy?.name ?? "A former team member"} · {fmtDateTime(task.createdAt, myTz)}
                </dd>
              </div>
              {task.doneAt && (
                <div>
                  <dt className="text-xs text-ink-3">Finished</dt>
                  <dd>{fmtDateTime(task.doneAt, myTz)}</dd>
                </div>
              )}
            </dl>
          </div>

          {open && task.extensionDate && (
            <div className="card border-warn/40 bg-warn/10 p-4">
              <div className="text-sm font-medium text-warn-text">
                {isAssignee ? "You asked for more time" : `${task.assignee.name} asks for more time`}
              </div>
              <p className="mt-1 text-sm">
                New due date: <span className="font-medium">{fmtDue(task.extensionDate, task.extensionTime, true)}</span>
              </p>
              {task.extensionReason && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">“{task.extensionReason}”</p>}
              {manager && !isAssignee ? (
                <div className="mt-3">
                  <AnswerMoreTime taskId={id} />
                </div>
              ) : (
                <p className="mt-2 text-xs text-ink-3">Waiting for an answer. You&apos;ll get a notification.</p>
              )}
              {manager && isAssignee && (
                <div className="mt-3">
                  <AnswerMoreTime taskId={id} />
                </div>
              )}
            </div>
          )}

          {open && (isAssignee || manager) && (
            <div className="card space-y-2 p-4">
              <DoneForm taskId={id} doneMeans={task.doneMeans} />
              {isAssignee && !task.extensionDate && <MoreTimeForm taskId={id} minDate={task.dueDate} />}
            </div>
          )}
          {!open && manager && (
            <div className="card p-4">
              <ReopenButton taskId={id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

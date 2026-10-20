import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Clock, Plus } from "lucide-react";
import { canManageTasks, requireSignedIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { DUE_GROUPS, dueGroup, dueLabel, fmtDue, fmtDueDate, type DueGroup } from "@/lib/tasks/due";
import { PriorityBadge } from "@/components/tasks/PriorityBadge";

const DUE_TONE: Record<DueGroup, string> = {
  overdue: "text-bad-text font-medium",
  today: "text-warn-text font-medium",
  week: "text-ink-2",
  later: "text-ink-3",
};

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ tab?: string; person?: string }> }) {
  const me = await requireSignedIn();
  const manager = canManageTasks(me.role);
  const sp = await searchParams;
  const tabs = manager
    ? [{ key: "all", label: "All open" }, { key: "mine", label: "My tasks" }, { key: "done", label: "Done" }]
    : [{ key: "mine", label: "My tasks" }, { key: "done", label: "Done" }];
  const tab = tabs.find((t) => t.key === sp.tab) ?? tabs[0];
  const people = manager ? await db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  const person = manager && people.some((p) => p.id === sp.person) ? sp.person : undefined;

  const visible: Prisma.TaskWhereInput = manager ? (person ? { assigneeId: person } : {}) : { assigneeId: me.id };
  const where: Prisma.TaskWhereInput =
    tab.key === "done" ? { ...visible, status: "done" } : tab.key === "mine" ? { assigneeId: me.id, status: "open" } : { ...visible, status: "open" };

  const [tasks, counts, requests] = await Promise.all([
    db.task.findMany({
      where,
      orderBy: tab.key === "done" ? { doneAt: "desc" } : [{ dueAt: "asc" }],
      take: tab.key === "done" ? 100 : 500,
      include: { assignee: { select: { name: true } }, _count: { select: { updates: { where: { kind: "comment" } } } } },
    }),
    Promise.all(
      tabs.map((t) =>
        t.key === "done" ? null : db.task.count({ where: t.key === "mine" ? { assigneeId: me.id, status: "open" } : { status: "open" } }),
      ),
    ),
    manager ? db.task.findMany({ where: { status: "open", extensionDate: { not: null } }, include: { assignee: { select: { name: true } } }, orderBy: { updatedAt: "asc" } }) : [],
  ]);

  const now = new Date();
  const groups = DUE_GROUPS.map((g) => ({ ...g, tasks: tasks.filter((t) => dueGroup(t, now) === g.key) })).filter((g) => g.tasks.length > 0);
  const showAssignee = tab.key !== "mine";
  const tabHref = (key: string) => `/tasks?tab=${key}${person && key !== "mine" ? `&person=${person}` : ""}`;

  const row = (t: (typeof tasks)[number]) => {
    const group = dueGroup(t, now);
    const label = dueLabel(t, now);
    // The exact date only when the label doesn't already say it ("Due tomorrow", "2 days overdue").
    const exactDate = t.status === "done" || !label.includes(fmtDueDate(t.dueDate));
    return (
      <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.status === "done" ? "bg-good" : t.priority === "urgent" ? "bg-bad" : t.priority === "high" ? "bg-warn" : "bg-border-strong"}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <span className={`text-sm font-medium ${t.status === "done" ? "text-ink-2 line-through decoration-ink-3" : ""}`}>{t.title}</span>
            <span className={`shrink-0 text-xs ${t.status === "done" ? "text-ink-3" : DUE_TONE[group]}`}>
              {t.status === "done" ? `Done ${t.doneAt ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: t.dueTimeZone }).format(t.doneAt) : ""}` : label}
            </span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
            {showAssignee && <span className="text-ink-2">{t.assignee.name}</span>}
            {showAssignee && exactDate && <span aria-hidden>·</span>}
            {exactDate && <span>Due {fmtDue(t.dueDate, t.dueTime)}</span>}
            {t.status === "open" && <PriorityBadge priority={t.priority} />}
            {t.extensionDate && t.status === "open" && (
              <span className="badge border-warn/40 bg-warn/10 text-warn-text">
                <Clock className="h-3 w-3" /> Asked for more time
              </span>
            )}
            {t._count.updates > 0 && <span>· {t._count.updates} update{t._count.updates === 1 ? "" : "s"}</span>}
          </span>
        </span>
      </Link>
    );
  };

  return (
    <div>
      <PageHeader title="Tasks" description={manager ? "Give each task a clear result and a due date. People get reminded automatically." : "Your tasks. You'll be reminded the day before, on the day, and every morning while a task is late."}>
        {manager && (
          <Link href="/tasks/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New task
          </Link>
        )}
      </PageHeader>

      {requests.length > 0 && (
        <div className="mb-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          <div className="font-medium text-warn-text">
            {requests.length} request{requests.length === 1 ? "" : "s"} for more time waiting for you
          </div>
          <ul className="mt-1 space-y-0.5">
            {requests.map((r) => (
              <li key={r.id}>
                <Link href={`/tasks/${r.id}`} className="text-ink-2 hover:text-ink hover:underline">
                  {r.assignee.name}: {r.title} → {fmtDue(r.extensionDate!, r.extensionTime)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap gap-1">
          {tabs.map((t, i) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${t.key === tab.key ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface-2"}`}
            >
              {t.label}
              {counts[i] !== null && <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-ink-3">{counts[i]}</span>}
            </Link>
          ))}
        </nav>
        {manager && tab.key !== "mine" && (
          <form className="flex items-center gap-2 sm:w-56">
            <input type="hidden" name="tab" value={tab.key} />
            <select name="person" defaultValue={person ?? ""} className="input py-1.5" aria-label="Show tasks for">
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button type="submit" className="btn-secondary py-1.5">Show</button>
          </form>
        )}
      </div>

      {tab.key === "done" ? (
        <div className="card divide-y divide-border overflow-hidden">
          {tasks.map(row)}
          {tasks.length === 0 && <div className="px-4 py-10 text-center text-sm text-ink-3">No finished tasks yet.</div>}
        </div>
      ) : groups.length === 0 ? (
        <div className="card px-4 py-10 text-center text-sm text-ink-3">
          {tab.key === "mine" ? "Nothing assigned to you. You're all caught up." : manager ? "No open tasks. Create one with New task." : "No open tasks."}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className={`mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide ${g.key === "overdue" ? "text-bad-text" : "text-ink-3"}`}>
                {g.label} · {g.tasks.length}
              </h2>
              <div className={`card divide-y divide-border overflow-hidden ${g.key === "overdue" ? "border-bad/30" : ""}`}>{g.tasks.map(row)}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

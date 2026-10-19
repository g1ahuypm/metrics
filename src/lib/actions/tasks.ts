"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { canManageTasks, requireSignedIn, type SessionUser } from "../auth";
import { getSettingsRow } from "../integrations/config";
import { validTimezone } from "../scope";
import { notify, type NewNotification } from "../notify";
import { dueInstant, fmtDue, PRIORITIES } from "../tasks/due";
import type { FormState } from "./auth";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const taskForm = z.object({
  title: z.string().trim().min(3, "Write the task (at least 3 characters)").max(120, "Keep the task under 120 characters; put the rest in Details"),
  details: z.string().trim().min(1, "Write the details: what exactly to do").max(4000),
  doneMeans: z.string().trim().min(3, "Write what 'done' means, so it's clear when the task is finished").max(1000),
  assigneeId: z.string().min(1, "Choose who it's for"),
  dueDate: z.string().regex(DATE, "Choose a due date"),
  dueTime: z.union([z.literal(""), z.string().regex(TIME, "Enter a time like 17:00")]),
  priority: z.enum(PRIORITIES.map((p) => p.key) as [string, ...string[]]),
  link: z.string().trim().max(500),
});

function normalizeLink(raw: string): string | null | undefined {
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes(".") ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** The time zone a person's due dates are counted in: theirs, else the creator's, else the store's. */
async function zoneFor(userTz: string | null, me: SessionUser): Promise<string> {
  if (userTz) return validTimezone(userTz);
  if (me.timeZone) return validTimezone(me.timeZone);
  return validTimezone((await getSettingsRow()).timezone);
}

/** Owner and admins see every task; others only the tasks given to them or created by them. */
async function loadTask(id: string, me: SessionUser) {
  const task = await db.task.findUnique({ where: { id }, include: { assignee: { select: { id: true, name: true, timeZone: true } } } });
  if (!task) return null;
  if (task.assigneeId !== me.id && task.createdById !== me.id && !canManageTasks(me.role)) return null;
  return task;
}

/** Who hears about the assignee's progress: the creator, or the owner if the creator left. */
async function managersOf(task: { createdById: string | null }): Promise<string[]> {
  if (task.createdById) return [task.createdById];
  return (await db.user.findMany({ where: { role: "OWNER" }, select: { id: true } })).map((u) => u.id);
}

function refresh(id?: string) {
  revalidatePath("/tasks");
  revalidatePath("/inbox");
  if (id) revalidatePath(`/tasks/${id}`);
}

/** Creates a task, or saves changes to one (when the form has an id). Owner and admins only. */
export async function saveTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSignedIn();
  if (!canManageTasks(me.role)) return { error: "Only the owner and admins can create or change tasks" };
  const parsed = taskForm.safeParse({
    title: formData.get("title") ?? "",
    details: formData.get("details") ?? "",
    doneMeans: formData.get("doneMeans") ?? "",
    assigneeId: formData.get("assigneeId") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    dueTime: formData.get("dueTime") ?? "",
    priority: formData.get("priority") ?? "normal",
    link: formData.get("link") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const f = parsed.data;
  const link = normalizeLink(f.link);
  if (link === undefined) return { error: "The link doesn't look like a web address" };

  const assignee = await db.user.findUnique({ where: { id: f.assigneeId }, select: { id: true, name: true, timeZone: true } });
  if (!assignee) return { error: "That team member no longer exists" };
  const tz = await zoneFor(assignee.timeZone, me);
  const dueTime = f.dueTime || null;
  const dueAt = dueInstant(f.dueDate, dueTime, tz);
  const due = fmtDue(f.dueDate, dueTime, true);
  const id = String(formData.get("id") ?? "");

  if (!id) {
    if (dueAt <= new Date()) return { error: `That due date has already passed${assignee.timeZone ? ` in ${assignee.name}'s time zone` : ""}` };
    const task = await db.task.create({
      data: {
        title: f.title,
        details: f.details,
        doneMeans: f.doneMeans,
        priority: f.priority,
        dueDate: f.dueDate,
        dueTime,
        dueTimeZone: tz,
        dueAt,
        link,
        assigneeId: assignee.id,
        createdById: me.id,
        updates: { create: { userId: me.id, kind: "created", text: `Assigned to ${assignee.name}, due ${due}` } },
      },
    });
    if (assignee.id !== me.id) {
      await notify([{ userId: assignee.id, taskId: task.id, kind: "assigned", title: `New task from ${me.name}`, body: `${f.title} · due ${due}`, href: `/tasks/${task.id}` }]);
    }
    refresh();
    redirect(`/tasks/${task.id}`);
  }

  const old = await loadTask(id, me);
  if (!old) return { error: "Task not found" };
  const dueChanged = old.dueDate !== f.dueDate || old.dueTime !== dueTime || old.assigneeId !== assignee.id;
  if (dueChanged && old.status === "open" && dueAt <= new Date()) return { error: "That due date has already passed" };
  const reassigned = old.assigneeId !== assignee.id;
  const edited = old.title !== f.title || old.details !== f.details || old.doneMeans !== f.doneMeans || old.priority !== f.priority || old.link !== link;
  if (!dueChanged && !edited) redirect(`/tasks/${id}`);

  const log: { kind: string; text: string }[] = [];
  if (reassigned) log.push({ kind: "reassigned", text: `Moved from ${old.assignee.name} to ${assignee.name}` });
  if (old.dueDate !== f.dueDate || old.dueTime !== dueTime) log.push({ kind: "due_changed", text: `Due date changed from ${fmtDue(old.dueDate, old.dueTime, true)} to ${due}` });
  if (edited) log.push({ kind: "edited", text: "Edited the task" });

  await db.task.update({
    where: { id },
    data: {
      title: f.title,
      details: f.details,
      doneMeans: f.doneMeans,
      priority: f.priority,
      dueDate: f.dueDate,
      dueTime,
      dueTimeZone: tz,
      dueAt,
      link,
      assigneeId: assignee.id,
      // A new due date answers any pending request for more time.
      ...(dueChanged ? { extensionDate: null, extensionTime: null, extensionReason: null } : {}),
      updates: { create: log.map((l) => ({ ...l, userId: me.id })) },
    },
  });

  const href = `/tasks/${id}`;
  const out: NewNotification[] = [];
  if (reassigned) {
    if (assignee.id !== me.id) out.push({ userId: assignee.id, taskId: id, kind: "assigned", title: `New task from ${me.name}`, body: `${f.title} · due ${due}`, href });
    if (old.assigneeId !== me.id) out.push({ userId: old.assigneeId, taskId: id, kind: "reassigned", title: `Task moved to ${assignee.name}`, body: f.title, href });
  } else if (assignee.id !== me.id) {
    out.push({
      userId: assignee.id,
      taskId: id,
      kind: "edited",
      title: `${me.name} changed your task`,
      body: old.dueDate !== f.dueDate || old.dueTime !== dueTime ? `${f.title} · now due ${due}` : f.title,
      href,
    });
  }
  await notify(out);
  refresh(id);
  redirect(href);
}

/** A comment or progress note on the task's timeline. */
export async function postTaskUpdateAction(taskId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSignedIn();
  const task = await loadTask(taskId, me);
  if (!task) return { error: "Task not found" };
  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 2) return { error: "Write the update first" };
  if (text.length > 4000) return { error: "That update is too long" };
  await db.taskUpdate.create({ data: { taskId, userId: me.id, kind: "comment", text } });
  const people = new Set([task.assigneeId, ...(await managersOf(task))]);
  people.delete(me.id);
  await notify(
    [...people].map((userId) => ({ userId, taskId, kind: "comment", title: `${me.name} posted an update`, body: `${task.title}: ${text}`.slice(0, 300), href: `/tasks/${taskId}` })),
  );
  refresh(taskId);
  return { success: "Update posted" };
}

export async function completeTaskAction(taskId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSignedIn();
  const task = await loadTask(taskId, me);
  if (!task) return { error: "Task not found" };
  if (task.assigneeId !== me.id && !canManageTasks(me.role)) return { error: "Only the person it's assigned to can mark it done" };
  if (task.status === "done") return { success: "Already done" };
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  await db.task.update({
    where: { id: taskId },
    data: {
      status: "done",
      doneAt: new Date(),
      extensionDate: null,
      extensionTime: null,
      extensionReason: null,
      updates: { create: { userId: me.id, kind: "done", text: note || null } },
    },
  });
  const people = new Set([task.assigneeId, ...(await managersOf(task))]);
  people.delete(me.id);
  await notify([...people].map((userId) => ({ userId, taskId, kind: "done", title: `${me.name} finished a task`, body: note ? `${task.title}: ${note}` : task.title, href: `/tasks/${taskId}` })));
  refresh(taskId);
  return { success: "Marked as done" };
}

export async function reopenTaskAction(taskId: string): Promise<void> {
  const me = await requireSignedIn();
  if (!canManageTasks(me.role)) return;
  const task = await loadTask(taskId, me);
  if (!task || task.status !== "done") return;
  await db.task.update({ where: { id: taskId }, data: { status: "open", doneAt: null, updates: { create: { userId: me.id, kind: "reopened" } } } });
  if (task.assigneeId !== me.id) {
    await notify([{ userId: task.assigneeId, taskId, kind: "reopened", title: `${me.name} reopened a task`, body: `${task.title} · due ${fmtDue(task.dueDate, task.dueTime, true)}`, href: `/tasks/${taskId}` }]);
  }
  refresh(taskId);
}

/** The assignee asks for a later due date; the owner or an admin approves or declines it. */
export async function requestMoreTimeAction(taskId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSignedIn();
  const task = await loadTask(taskId, me);
  if (!task) return { error: "Task not found" };
  if (task.assigneeId !== me.id) return { error: "Only the person it's assigned to can ask for more time" };
  if (task.status !== "open") return { error: "This task is already done" };
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!DATE.test(date)) return { error: "Choose the new date" };
  if (time && !TIME.test(time)) return { error: "Enter a time like 17:00" };
  if (reason.length < 3) return { error: "Say briefly why you need more time" };
  const newDue = dueInstant(date, time || null, task.dueTimeZone);
  if (newDue <= task.dueAt || newDue <= new Date()) return { error: "Pick a date later than the current due date" };
  const due = fmtDue(date, time || null, true);
  await db.task.update({
    where: { id: taskId },
    data: {
      extensionDate: date,
      extensionTime: time || null,
      extensionReason: reason.slice(0, 1000),
      updates: { create: { userId: me.id, kind: "extension_requested", text: `Asked to move the due date to ${due}: ${reason}` } },
    },
  });
  const managers = (await managersOf(task)).filter((id) => id !== me.id);
  await notify(managers.map((userId) => ({ userId, taskId, kind: "extension_requested", title: `${me.name} asks for more time`, body: `${task.title}: move to ${due}. ${reason}`.slice(0, 300), href: `/tasks/${taskId}` })));
  refresh(taskId);
  return { success: "Request sent. You'll be notified when it's answered." };
}

export async function answerMoreTimeAction(taskId: string, approve: boolean): Promise<FormState> {
  const me = await requireSignedIn();
  if (!canManageTasks(me.role)) return { error: "Only the owner and admins can answer this" };
  const task = await loadTask(taskId, me);
  if (!task?.extensionDate) return { error: "There is no request to answer" };
  const href = `/tasks/${taskId}`;
  if (approve) {
    const due = fmtDue(task.extensionDate, task.extensionTime, true);
    await db.task.update({
      where: { id: taskId },
      data: {
        dueDate: task.extensionDate,
        dueTime: task.extensionTime,
        dueAt: dueInstant(task.extensionDate, task.extensionTime, task.dueTimeZone),
        extensionDate: null,
        extensionTime: null,
        extensionReason: null,
        updates: { create: { userId: me.id, kind: "extension_approved", text: `Approved. New due date: ${due}` } },
      },
    });
    if (task.assigneeId !== me.id) await notify([{ userId: task.assigneeId, taskId, kind: "extension_approved", title: "More time approved", body: `${task.title} · now due ${due}`, href }]);
  } else {
    const due = fmtDue(task.dueDate, task.dueTime, true);
    await db.task.update({
      where: { id: taskId },
      data: { extensionDate: null, extensionTime: null, extensionReason: null, updates: { create: { userId: me.id, kind: "extension_declined", text: `Declined. Still due ${due}` } } },
    });
    if (task.assigneeId !== me.id) await notify([{ userId: task.assigneeId, taskId, kind: "extension_declined", title: "More time declined", body: `${task.title} · still due ${due}`, href }]);
  }
  refresh(taskId);
  return { success: approve ? "Approved" : "Declined" };
}

export async function deleteTaskAction(taskId: string): Promise<void> {
  const me = await requireSignedIn();
  if (!canManageTasks(me.role)) return;
  const task = await loadTask(taskId, me);
  if (!task) return;
  await db.task.delete({ where: { id: taskId } });
  refresh();
  redirect("/tasks");
}

import { addDays, differenceInCalendarDays } from "date-fns";
import { dayEnd, parseISODate, storeDate, toISODate, zonedInstant } from "../dates";

// A task's due date is a calendar date (plus an optional time) in the ASSIGNEE's time
// zone: "due Oct 22" means by the end of Oct 22 where that person lives.

export const PRIORITIES = [
  { key: "normal", label: "Normal" },
  { key: "high", label: "High" },
  { key: "urgent", label: "Urgent" },
] as const;

export type Priority = (typeof PRIORITIES)[number]["key"];

export function priorityLabel(p: string): string {
  return PRIORITIES.find((x) => x.key === p)?.label ?? "Normal";
}

/** The moment a task becomes overdue. */
export function dueInstant(dueDate: string, dueTime: string | null, tz: string): Date {
  if (dueTime) return zonedInstant(dueDate, dueTime, tz);
  return dayEnd(parseISODate(dueDate)!, tz);
}

/** "17:00" → "5:00 PM" */
export function fmtTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "2026-10-22" → "Oct 22" (or "Thu, Oct 22" with the weekday). */
export function fmtDueDate(date: string, weekday = false): string {
  const d = parseISODate(date);
  if (!d) return date;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...(weekday ? { weekday: "short" } : {}) }).format(d);
}

export function fmtDue(date: string, time: string | null, weekday = false): string {
  return `${fmtDueDate(date, weekday)}${time ? `, ${fmtTime(time)}` : ""}`;
}

/** Calendar days from today (in the task's time zone) to its due date: 0 today, 1 tomorrow, -2 two days ago. */
export function daysUntilDue(task: { dueDate: string; dueTimeZone: string }, now = new Date()): number {
  const today = parseISODate(storeDate(now, task.dueTimeZone))!;
  return differenceInCalendarDays(parseISODate(task.dueDate)!, today);
}

export function tomorrowOf(date: string): string {
  return toISODate(addDays(parseISODate(date)!, 1));
}

export type DueGroup = "overdue" | "today" | "week" | "later";

export const DUE_GROUPS: { key: DueGroup; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "week", label: "Next 7 days" },
  { key: "later", label: "Later" },
];

type DueTask = { dueDate: string; dueTime: string | null; dueTimeZone: string; dueAt: Date };

export function dueGroup(task: DueTask, now = new Date()): DueGroup {
  if (task.dueAt <= now) return "overdue";
  const days = daysUntilDue(task, now);
  if (days <= 0) return "today";
  if (days <= 7) return "week";
  return "later";
}

/** "Due today by 5:00 PM", "Due tomorrow", "3 days overdue", "Due Thu, Oct 30". */
export function dueLabel(task: DueTask, now = new Date()): string {
  const days = daysUntilDue(task, now);
  const at = task.dueTime ? ` by ${fmtTime(task.dueTime)}` : "";
  if (task.dueAt <= now) {
    if (days >= 0) return task.dueTime ? `Overdue since ${fmtTime(task.dueTime)}` : "Overdue";
    return `${-days} day${days === -1 ? "" : "s"} overdue`;
  }
  if (days <= 0) return `Due today${at}`;
  if (days === 1) return `Due tomorrow${at}`;
  return `Due ${fmtDue(task.dueDate, task.dueTime, days < 7)}`;
}

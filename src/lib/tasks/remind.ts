import "server-only";
import { db } from "../db";
import { hourIn, storeDate } from "../dates";
import { validTimezone } from "../scope";
import { firstStoreTimezone } from "../stores";
import { addNotifications, pushNotifications, type NewNotification } from "../notify";
import { daysUntilDue, fmtDue } from "./due";

// Reminders go out between 9 am and 9 pm in the person's own time zone, so a check
// that runs at night waits for the morning instead of waking anyone up.
const DAY_START = 9;
const DAY_END = 21;

function awake(now: Date, tz: string): boolean {
  const h = hourIn(now, tz);
  return h >= DAY_START && h < DAY_END;
}

/**
 * Due tomorrow, due today and overdue reminders. Safe to run as often as you like:
 * each reminder has a key (task, kind, day), so it is sent at most once.
 */
export async function runTaskReminders(now = new Date()): Promise<{ reminders: number }> {
  const [settings, tasks] = await Promise.all([
    firstStoreTimezone(),
    db.task.findMany({
      // Anything due within 3 days covers "due tomorrow" in every time zone.
      where: { status: "open", dueAt: { lte: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) } },
      include: { assignee: { select: { id: true, name: true } }, createdBy: { select: { id: true, timeZone: true } } },
    }),
  ]);
  const storeTz = validTimezone(settings);

  const items: NewNotification[] = [];
  for (const task of tasks) {
    const tz = task.dueTimeZone;
    const href = `/tasks/${task.id}`;
    const due = fmtDue(task.dueDate, task.dueTime, true);
    const today = storeDate(now, tz);
    const createdToday = storeDate(task.createdAt, tz) === today;
    const days = daysUntilDue(task, now);

    if (now >= task.dueAt) {
      const late = -days;
      if (awake(now, tz)) {
        items.push({
          userId: task.assigneeId,
          taskId: task.id,
          kind: "overdue",
          title: late <= 0 ? `Overdue: ${task.title}` : `${late} day${late === 1 ? "" : "s"} overdue: ${task.title}`,
          body: `Was due ${due}. Finish it, post an update, or ask for more time.`,
          href,
          key: `${task.id}:overdue:${today}`,
        });
      }
      // From the second day late, whoever created the task hears about it too.
      const creator = task.createdBy;
      if (late >= 2 && creator && creator.id !== task.assigneeId) {
        const ctz = validTimezone(creator.timeZone ?? storeTz);
        if (awake(now, ctz)) {
          items.push({
            userId: creator.id,
            taskId: task.id,
            kind: "overdue_copy",
            title: `${task.assignee.name}'s task is ${late} days overdue`,
            body: `${task.title} (was due ${due})`,
            href,
            key: `${task.id}:overdue_copy:${storeDate(now, ctz)}`,
          });
        }
      }
      continue;
    }

    // Not for a task created today: the "new task" notification already said when it's due.
    if (createdToday || !awake(now, tz)) continue;
    if (days === 1 || days === 0) {
      items.push({
        userId: task.assigneeId,
        taskId: task.id,
        kind: days === 1 ? "due_tomorrow" : "due_today",
        title: `${days === 1 ? "Due tomorrow" : "Due today"}: ${task.title}`,
        body: `${task.dueTime ? `By ${due}. ` : ""}Done means: ${task.doneMeans}`.slice(0, 300),
        href,
        key: `${task.id}:${days === 1 ? "due_tomorrow" : "due_today"}:${task.dueDate}`,
      });
    }
  }

  const created = await addNotifications(items);
  const toAssignee = created.filter((n) => n.kind !== "overdue_copy");
  if (toAssignee.length) {
    await db.taskUpdate.createMany({
      data: toAssignee.map((n) => ({
        taskId: n.taskId!,
        kind: "reminder",
        text: n.kind === "due_tomorrow" ? "Reminder sent: due tomorrow" : n.kind === "due_today" ? "Reminder sent: due today" : "Reminder sent: overdue",
      })),
    });
  }
  try {
    await pushNotifications(created);
  } catch (err) {
    console.error("reminder push failed", err);
  }
  await db.settings.updateMany({ where: { id: "default" }, data: { lastTaskReminderAt: now } });
  return { reminders: created.length };
}

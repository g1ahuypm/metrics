import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { hourIn, storeDate } from "../dates";
import { validTimezone } from "../scope";
import { addNotifications, pushNotifications, type NewNotification } from "../notify";

// The Support "To do" list: emails the team has to come back to. One shared list per store.
// An email lands there when someone clicks "To do", when the AI sees a clearly upset customer,
// or when someone opened it and nobody answered within 24 hours. It leaves when a person sends
// a reply, marks it done, or removes it.

/** Opened but still not answered after this long: goes onto To do by itself. */
export const OPENED_GRACE_MS = 24 * 60 * 60 * 1000;
/** Urgent emails remind once a day, starting this long after landing on To do. */
const FIRST_REMINDER_MS = 2 * 60 * 60 * 1000;

/** Threads on the To do list: saved ones, plus replied emails the AI left a team to do on. */
export const TODO_WHERE: Prisma.SupportThreadWhereInput = {
  category: { not: "other" },
  OR: [{ todoAt: { not: null } }, { status: "needs_action" }],
};

/** Fields that take a thread off the To do list (and restart the "opened" clock). */
export const OFF_TODO = {
  todoAt: null,
  todoNote: null,
  todoById: null,
  todoByName: null,
  todoAuto: false,
  urgent: false,
  openedAt: null,
  openedById: null,
} satisfies Prisma.SupportThreadUpdateInput;

/** Puts emails that someone opened but nobody answered within 24 hours onto To do. */
export async function catchOpenedNotAnswered(now = new Date()): Promise<number> {
  const stale = await db.supportThread.findMany({
    where: { category: { not: "other" }, status: "needs_reply", todoAt: null, openedAt: { lte: new Date(now.getTime() - OPENED_GRACE_MS) } },
    select: { id: true, openedAt: true, openedById: true },
    take: 500,
  });
  if (!stale.length) return 0;
  const names = new Map(
    (await db.user.findMany({ where: { id: { in: stale.map((t) => t.openedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  let caught = 0;
  for (const t of stale) {
    // Conditional, so two checks running at once can't both move it.
    const r = await db.supportThread.updateMany({
      where: { id: t.id, todoAt: null, status: "needs_reply" },
      data: { todoAt: new Date(t.openedAt!.getTime() + OPENED_GRACE_MS), todoAuto: true, todoById: t.openedById, todoByName: t.openedById ? names.get(t.openedById) ?? null : null },
    });
    caught += r.count;
  }
  return caught;
}

/**
 * Urgent emails on To do (clearly upset customer, or marked urgent): one reminder a day, between
 * 9 am and 9 pm in the person's time zone, to whoever put it there, or, when the AI put it there,
 * to everyone who answers that store's emails. Safe to run often: each reminder has a key.
 */
export async function runTodoReminders(now = new Date()): Promise<{ caught: number; reminders: number }> {
  const caught = await catchOpenedNotAnswered(now);
  const threads = await db.supportThread.findMany({
    where: { category: { not: "other" }, urgent: true, todoAt: { not: null, lte: new Date(now.getTime() - FIRST_REMINDER_MS) } },
    select: { id: true, storeId: true, subject: true, summary: true, todoNote: true, todoById: true, customerName: true, customerEmail: true, store: { select: { name: true, timezone: true } } },
    take: 200,
  });
  if (!threads.length) return { caught, reminders: 0 };

  const people = await db.user.findMany({
    where: { role: { in: ["OWNER", "ADMIN", "SUPPORT"] } },
    select: { id: true, role: true, timeZone: true, stores: { select: { storeId: true } } },
  });
  const byId = new Map(people.map((p) => [p.id, p]));
  const seesStore = (p: (typeof people)[number], storeId: string | null) => p.role === "OWNER" || (storeId != null && p.stores.some((s) => s.storeId === storeId));

  const items: NewNotification[] = [];
  for (const t of threads) {
    const saver = t.todoById ? byId.get(t.todoById) : undefined;
    const recipients = saver && seesStore(saver, t.storeId) ? [saver] : people.filter((p) => seesStore(p, t.storeId));
    const who = t.customerName || t.customerEmail;
    for (const p of recipients) {
      const tz = validTimezone(p.timeZone ?? t.store?.timezone ?? "UTC");
      const h = hourIn(now, tz);
      if (h < 9 || h >= 21) continue;
      items.push({
        userId: p.id,
        kind: "support_todo",
        title: `Urgent email waiting: ${who}`,
        body: (t.todoNote || t.summary || t.subject).slice(0, 300),
        href: `/support/${t.id}`,
        key: `todo:${t.id}:${p.id}:${storeDate(now, tz)}`,
      });
    }
  }
  const created = await addNotifications(items);
  try {
    await pushNotifications(created);
  } catch (err) {
    console.error("support to-do push failed", err);
  }
  return { caught, reminders: created.length };
}

/** "3 h", "2 days": how long something has waited. */
export function waited(since: Date, now = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - since.getTime()) / 60000));
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

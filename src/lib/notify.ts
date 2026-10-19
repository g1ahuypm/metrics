import "server-only";
import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { sendPush } from "./push";

// Everything that lands in someone's personal inbox goes through here: the inbox row
// is the record, the phone/browser notification is the nudge.

export type NewNotification = {
  userId: string;
  kind: string;
  title: string;
  body?: string;
  href: string;
  taskId?: string;
  key?: string; // reminders: skip if this exact reminder already exists
};

/** Stores the notifications and returns the ones that are new (duplicate reminder keys are skipped). */
export async function addNotifications(items: NewNotification[]): Promise<NewNotification[]> {
  const keys = items.map((n) => n.key).filter((k): k is string => Boolean(k));
  const sent = new Set(
    keys.length ? (await db.notification.findMany({ where: { key: { in: keys } }, select: { key: true } })).map((n) => n.key) : [],
  );
  const created: NewNotification[] = [];
  for (const n of items) {
    if (n.key && sent.has(n.key)) continue;
    try {
      await db.notification.create({ data: { userId: n.userId, kind: n.kind, title: n.title, body: n.body ?? null, href: n.href, taskId: n.taskId ?? null, key: n.key ?? null } });
      created.push(n);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  return created;
}

/** One phone/browser notification per person, however many inbox items they just got. */
export async function pushNotifications(items: NewNotification[]): Promise<void> {
  const byUser = new Map<string, NewNotification[]>();
  for (const n of items) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
  await Promise.all(
    [...byUser].map(([userId, list]) => {
      if (list.length === 1) {
        const [n] = list;
        return sendPush([userId], { title: n.title, body: n.body, url: n.href, tag: n.taskId ?? n.kind });
      }
      return sendPush([userId], {
        title: `${list.length} task updates`,
        body: list.map((n) => n.title).join("\n").slice(0, 400),
        url: "/inbox",
        tag: "digest",
      });
    }),
  );
}

/** Adds to the inbox now; the phone/browser notification goes out right after the response. */
export async function notify(items: NewNotification[]): Promise<void> {
  const created = await addNotifications(items);
  if (created.length === 0) return;
  after(async () => {
    try {
      await pushNotifications(created);
    } catch (err) {
      console.error("push failed", err);
    }
  });
}

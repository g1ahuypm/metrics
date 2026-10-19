"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { requireSignedIn } from "../auth";
import { validTimezone } from "../scope";
import { sendPush } from "../push";
import type { FormState } from "./auth";

export async function markAllReadAction(): Promise<void> {
  const me = await requireSignedIn();
  await db.notification.updateMany({ where: { userId: me.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

/** Remembers the person's time zone (from their browser), so reminders arrive in their morning. */
export async function setMyTimeZoneAction(tz: string): Promise<void> {
  const me = await requireSignedIn();
  if (!tz || validTimezone(tz) !== tz || tz === me.timeZone) return;
  await db.user.update({ where: { id: me.id }, data: { timeZone: tz } });
}

const subscription = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(4).max(200) }),
});

/** This device wants phone/browser notifications. */
export async function savePushSubscriptionAction(sub: unknown, device: string): Promise<FormState> {
  const me = await requireSignedIn();
  const parsed = subscription.safeParse(sub);
  if (!parsed.success) return { error: "This browser sent an invalid subscription" };
  const { endpoint, keys } = parsed.data;
  await db.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: me.id, p256dh: keys.p256dh, auth: keys.auth, device: device.slice(0, 80) },
    create: { userId: me.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, device: device.slice(0, 80) },
  });
  return { success: "Notifications are on for this device" };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<void> {
  const me = await requireSignedIn();
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: me.id } });
}

export async function sendTestPushAction(): Promise<FormState> {
  const me = await requireSignedIn();
  const delivered = await sendPush([me.id], {
    title: "Notifications are working",
    body: "This is how task reminders will appear on this device.",
    url: "/inbox",
    tag: "test",
  });
  if (delivered === 0) return { error: "No device received it. Turn notifications on again on this device." };
  return { success: `Sent to ${delivered} device${delivered === 1 ? "" : "s"}. It should appear in a few seconds.` };
}

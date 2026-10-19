import "server-only";
import webpush from "web-push";
import { db } from "./db";
import { decrypt, encrypt } from "./crypto";

// Phone and browser notifications (the Web Push standard). The server signs every
// message with a key pair that is created once and kept in Settings, so nothing
// has to be set up by hand. Each device that turned notifications on is a
// PushSubscription; a device that was reset or blocked us is removed on its first failure.

export type PushMessage = { title: string; body?: string; url: string; tag?: string };

type Vapid = { publicKey: string; privateKey: string };

let cached: Vapid | null = null;

async function vapidKeys(): Promise<Vapid> {
  if (cached) return cached;
  const s = await db.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" }, select: { vapidPublicKey: true, vapidPrivateKey: true } });
  let publicKey = s.vapidPublicKey;
  let privateKey = decrypt(s.vapidPrivateKey);
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    // Only the first of two simultaneous requests may store its keys; the other reads them back.
    await db.settings.updateMany({
      where: { id: "default", OR: [{ vapidPublicKey: null }, { vapidPrivateKey: null }] },
      data: { vapidPublicKey: keys.publicKey, vapidPrivateKey: encrypt(keys.privateKey) },
    });
    const again = await db.settings.findUniqueOrThrow({ where: { id: "default" }, select: { vapidPublicKey: true, vapidPrivateKey: true } });
    publicKey = again.vapidPublicKey;
    privateKey = decrypt(again.vapidPrivateKey);
    if (!publicKey || !privateKey) throw new Error("Could not set up notification keys");
  }
  cached = { publicKey, privateKey };
  return cached;
}

/** The public key a browser needs to subscribe. */
export async function pushPublicKey(): Promise<string> {
  return (await vapidKeys()).publicKey;
}

async function contact(): Promise<string> {
  const owner = await db.user.findFirst({ where: { role: "OWNER" }, select: { email: true } });
  return `mailto:${owner?.email ?? "owner@example.com"}`;
}

/** Sends one notification to every device of each user. Returns how many devices accepted it. */
export async function sendPush(userIds: string[], message: PushMessage): Promise<number> {
  if (userIds.length === 0) return 0;
  const subs = await db.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  if (subs.length === 0) return 0;
  const { publicKey, privateKey } = await vapidKeys();
  const subject = await contact();
  const payload = JSON.stringify(message);
  const results = await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
          vapidDetails: { subject, publicKey, privateKey },
          TTL: 24 * 60 * 60,
          urgency: "high",
          timeout: 10_000,
        });
        await db.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } });
        return true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the device unsubscribed or was reset. 403: it was registered with other keys.
        if (status === 404 || status === 410 || status === 403) await db.pushSubscription.deleteMany({ where: { id: sub.id } });
        else console.error("push failed", status, err instanceof Error ? err.message : err);
        return false;
      }
    }),
  );
  return results.filter(Boolean).length;
}

import "server-only";
import { after } from "next/server";
import { db } from "./db";
import { runAllSyncs } from "./sync";

// The scheduler syncs about every half hour; this is only the backup when it hasn't run for a while,
// because a sync started from a page visit shares the server with the pages being opened.
const STALE_MS = 3 * 60 * 60 * 1000;
const RUNNING_MS = 10 * 60 * 1000; // treat a "running" log newer than this as still in progress

/**
 * Backup for the scheduler: when someone opens the app and the last sync is over three
 * hours old, a sync runs in the background after the page is served.
 */
export async function maybeAutoSync(): Promise<void> {
  const [stores, accounts] = await Promise.all([
    db.store.findMany({ where: { shopifyDomain: { not: null } }, select: { lastShopifySyncAt: true } }),
    db.adAccount.findMany({ where: { token: { not: null } }, select: { lastSyncAt: true } }),
  ]);
  if (stores.length === 0 && accounts.length === 0) return;

  const now = Date.now();
  const old = (d: Date | null) => !d || now - d.getTime() > STALE_MS;
  const stale = stores.some((s) => old(s.lastShopifySyncAt)) || accounts.some((a) => old(a.lastSyncAt));
  if (!stale) return;

  const running = await db.syncLog.findFirst({ where: { status: "running", startedAt: { gte: new Date(now - RUNNING_MS) } } });
  if (running) return;

  after(async () => {
    try {
      await runAllSyncs();
    } catch (err) {
      console.error("auto-sync failed", err);
    }
  });
}

const SUPPORT_STALE_MS = 2 * 60 * 1000;

/** Opening the Support inbox checks for new mail when the last check is over two minutes old. */
export async function maybeCheckSupport(storeIds?: string[]): Promise<void> {
  const now = Date.now();
  const stores = await db.store.findMany({
    where: { supportEmail: { not: null }, supportAppPassword: { not: null }, ...(storeIds ? { id: { in: storeIds } } : {}) },
    select: { id: true, lastSupportSyncAt: true, supportLockUntil: true },
  });
  const due = stores.filter(
    (s) => !(s.lastSupportSyncAt && now - s.lastSupportSyncAt.getTime() < SUPPORT_STALE_MS) && !(s.supportLockUntil && s.supportLockUntil.getTime() > now),
  );
  if (due.length === 0) return;
  after(async () => {
    const { runSupport } = await import("./support/run");
    for (const s of due) {
      try {
        await runSupport(s.id);
      } catch (err) {
        console.error("support check failed", err);
      }
    }
  });
}

const REMIND_STALE_MS = 2 * 60 * 1000;

/**
 * Task reminders also run when anyone opens the app, in case the scheduler is late.
 * Claiming the run with a conditional update keeps two page loads from both starting it.
 */
export async function maybeRemindTasks(): Promise<void> {
  const now = new Date();
  const claimed = await db.settings.updateMany({
    where: { id: "default", OR: [{ lastTaskReminderAt: null }, { lastTaskReminderAt: { lt: new Date(now.getTime() - REMIND_STALE_MS) } }] },
    data: { lastTaskReminderAt: now },
  });
  if (claimed.count === 0) return;
  after(async () => {
    try {
      const { runTaskReminders } = await import("./tasks/remind");
      await runTaskReminders();
    } catch (err) {
      console.error("task reminders failed", err);
    }
  });
}

import "server-only";
import { after } from "next/server";
import { db } from "./db";
import { runAllSyncs } from "./sync";

const STALE_MS = 60 * 60 * 1000; // refresh when the newest sync is older than an hour
const RUNNING_MS = 10 * 60 * 1000; // treat a "running" log newer than this as still in progress

/**
 * Keeps data fresh without a frequent cron: when someone opens the app and the
 * last sync is stale, a sync runs in the background after the page is served.
 */
export async function maybeAutoSync(): Promise<void> {
  const s = await db.settings.findUnique({
    where: { id: "default" },
    select: { shopifyDomain: true, shopifyToken: true, shopifyClientId: true, metaAdAccountId: true, metaToken: true, lastShopifySyncAt: true, lastMetaSyncAt: true },
  });
  if (!s) return;
  const shopify = Boolean(s.shopifyDomain && (s.shopifyToken || s.shopifyClientId));
  const meta = Boolean(s.metaAdAccountId && s.metaToken);
  if (!shopify && !meta) return;

  const now = Date.now();
  const stale =
    (shopify && (!s.lastShopifySyncAt || now - s.lastShopifySyncAt.getTime() > STALE_MS)) ||
    (meta && (!s.lastMetaSyncAt || now - s.lastMetaSyncAt.getTime() > STALE_MS));
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
export async function maybeCheckSupport(): Promise<void> {
  const s = await db.settings.findUnique({
    where: { id: "default" },
    select: { supportEmail: true, supportAppPassword: true, lastSupportSyncAt: true, supportLockUntil: true },
  });
  if (!s?.supportEmail || !s.supportAppPassword) return;
  const now = Date.now();
  if (s.lastSupportSyncAt && now - s.lastSupportSyncAt.getTime() < SUPPORT_STALE_MS) return;
  if (s.supportLockUntil && s.supportLockUntil.getTime() > now) return;
  after(async () => {
    try {
      const { runSupport } = await import("./support/run");
      await runSupport();
    } catch (err) {
      console.error("support check failed", err);
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

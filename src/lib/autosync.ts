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

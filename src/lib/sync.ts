import "server-only";
import { db } from "./db";
import { getAdAccountConfigs, getStoreConfig } from "./integrations/config";
import { syncShopify } from "./integrations/shopify";
import { syncMeta } from "./integrations/meta";
import { ensureStores } from "./stores";

export type SyncSource = "shopify" | "meta";

/** A Shopify sync is for one store; a Meta sync for one ad account. */
export type SyncTarget = { source: "shopify"; storeId: string } | { source: "meta"; adAccountId: string };

export type SyncResult = { source: SyncSource; ok: boolean; message: string; records: number };

export async function runSync(target: SyncTarget, opts: { full?: boolean } = {}): Promise<SyncResult> {
  const { source } = target;
  const log = await db.syncLog.create({
    data: { source, status: "running", ...(target.source === "shopify" ? { storeId: target.storeId } : { adAccountId: target.adAccountId }) },
  });
  try {
    let message = "";
    let records = 0;
    if (target.source === "shopify") {
      const cfg = await getStoreConfig(target.storeId);
      if (!cfg.shopify) throw new Error("Shopify is not connected for this store. Add its domain, Client ID and Client secret in Settings.");
      const r = await syncShopify(cfg, opts);
      records = r.orders;
      message = `${cfg.storeName}: ${opts.full ? "full resync, " : ""}${r.orders} orders and ${r.variants} product variants`;
    } else {
      const cfg = (await getAdAccountConfigs()).find((a) => a.id === target.adAccountId);
      if (!cfg) throw new Error("This Meta ad account is not connected (or has no access token). Check Settings.");
      const r = await syncMeta(cfg);
      records = r.insights;
      message = `${cfg.adAccountId}: ${r.campaigns} campaigns and ${r.insights} daily insight rows`;
    }
    await db.syncLog.update({
      where: { id: log.id },
      data: { status: "success", message, records, finishedAt: new Date() },
    });
    return { source, ok: true, message, records };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.syncLog.update({
      where: { id: log.id },
      data: { status: "error", message, finishedAt: new Date() },
    });
    return { source, ok: false, message, records: 0 };
  }
}

/** Every connected store's Shopify, then every ad account (store attribution needs the products first). */
export async function runAllSyncs(source?: SyncSource, opts: { full?: boolean } = {}): Promise<SyncResult[]> {
  await ensureStores();
  const results: SyncResult[] = [];
  if (source !== "meta") {
    const stores = await db.store.findMany({ where: { shopifyDomain: { not: null } }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    for (const s of stores) results.push(await runSync({ source: "shopify", storeId: s.id }, opts));
  }
  if (source !== "shopify") {
    for (const a of await getAdAccountConfigs()) results.push(await runSync({ source: "meta", adAccountId: a.id }, opts));
  }
  return results;
}

import "server-only";
import { db } from "./db";
import { getIntegrationConfig } from "./integrations/config";
import { syncShopify } from "./integrations/shopify";
import { syncMeta } from "./integrations/meta";

export type SyncSource = "shopify" | "meta";

export type SyncResult = { source: SyncSource; ok: boolean; message: string; records: number };

export async function runSync(source: SyncSource): Promise<SyncResult> {
  const log = await db.syncLog.create({ data: { source, status: "running" } });
  try {
    const cfg = await getIntegrationConfig();
    let message = "";
    let records = 0;
    if (source === "shopify") {
      if (!cfg.shopify) throw new Error("Shopify is not connected. Add your store domain and access token in Settings.");
      const r = await syncShopify(cfg);
      records = r.orders;
      message = `Synced ${r.orders} orders and ${r.variants} product variants`;
    } else {
      if (!cfg.meta) throw new Error("Meta Ads is not connected. Add your ad account ID and access token in Settings.");
      const r = await syncMeta(cfg);
      records = r.insights;
      message = `Synced ${r.campaigns} campaigns and ${r.insights} daily insight rows`;
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

export async function runAllSyncs(): Promise<SyncResult[]> {
  const cfg = await getIntegrationConfig();
  const results: SyncResult[] = [];
  if (cfg.shopify) results.push(await runSync("shopify"));
  if (cfg.meta) results.push(await runSync("meta"));
  return results;
}

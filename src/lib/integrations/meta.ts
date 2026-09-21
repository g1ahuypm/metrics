import "server-only";
import { subDays } from "date-fns";
import { db } from "../db";
import { toISODate, todayUtc } from "../dates";
import type { IntegrationConfig } from "./config";

const GRAPH = "https://graph.facebook.com/v21.0";

type Paged<T> = { data: T[]; paging?: { next?: string } };

type MetaCampaign = {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
};

type MetaAction = { action_type: string; value: string };

type MetaInsight = {
  date_start: string;
  campaign_id: string;
  campaign_name: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
};

async function metaGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json()) as T & { error?: { message: string; code?: number } };
  if (!res.ok || json.error) {
    throw new Error(`Meta API: ${json.error?.message ?? res.statusText}`);
  }
  return json;
}

async function metaPaged<T>(firstUrl: string): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = firstUrl;
  while (url) {
    const page: Paged<T> = await metaGet<Paged<T>>(url);
    out.push(...page.data);
    url = page.paging?.next;
  }
  return out;
}

function pick(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  for (const t of types) {
    const hit = actions.find((a) => a.action_type === t);
    if (hit) return Number(hit.value);
  }
  return 0;
}

const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const ATC_TYPES = ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"];
const IC_TYPES = ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];

export async function testMeta(cfg: { adAccountId: string; token: string }): Promise<string> {
  const url = `${GRAPH}/${cfg.adAccountId}?fields=name,currency,account_status&access_token=${encodeURIComponent(cfg.token)}`;
  const acc = await metaGet<{ name: string; currency: string }>(url);
  return `${acc.name} (${acc.currency})`;
}

export async function syncMetaCampaigns(cfg: IntegrationConfig): Promise<Map<string, string>> {
  if (!cfg.meta) throw new Error("Meta Ads is not connected");
  const url =
    `${GRAPH}/${cfg.meta.adAccountId}/campaigns?fields=id,name,status,effective_status,objective,daily_budget` +
    `&limit=200&access_token=${encodeURIComponent(cfg.meta.token)}`;
  const campaigns = await metaPaged<MetaCampaign>(url);
  const ids = new Map<string, string>();
  for (const c of campaigns) {
    const row = await db.campaign.upsert({
      where: { metaId: c.id },
      create: {
        metaId: c.id,
        name: c.name,
        status: c.effective_status ?? c.status,
        objective: c.objective ?? null,
        dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      },
      update: {
        name: c.name,
        status: c.effective_status ?? c.status,
        objective: c.objective ?? null,
        dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      },
    });
    ids.set(c.id, row.id);
  }
  return ids;
}

export async function syncMetaInsights(cfg: IntegrationConfig, since: Date, campaignIds: Map<string, string>): Promise<number> {
  if (!cfg.meta) throw new Error("Meta Ads is not connected");
  const timeRange = JSON.stringify({ since: toISODate(since), until: toISODate(todayUtc()) });
  const url =
    `${GRAPH}/${cfg.meta.adAccountId}/insights?level=campaign` +
    `&fields=campaign_id,campaign_name,spend,impressions,reach,inline_link_clicks,actions,action_values` +
    `&time_increment=1&time_range=${encodeURIComponent(timeRange)}&limit=500` +
    `&access_token=${encodeURIComponent(cfg.meta.token)}`;
  const rows = await metaPaged<MetaInsight>(url);

  let count = 0;
  for (const r of rows) {
    let campaignId = campaignIds.get(r.campaign_id);
    if (!campaignId) {
      // Campaign may have been deleted/archived but still has history.
      const c = await db.campaign.upsert({
        where: { metaId: r.campaign_id },
        create: { metaId: r.campaign_id, name: r.campaign_name, status: "ARCHIVED" },
        update: {},
      });
      campaignId = c.id;
      campaignIds.set(r.campaign_id, c.id);
    }
    const date = new Date(`${r.date_start}T00:00:00.000Z`);
    const data = {
      spend: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      reach: Number(r.reach ?? 0),
      clicks: Number(r.inline_link_clicks ?? 0),
      purchases: pick(r.actions, PURCHASE_TYPES),
      purchaseValue: pick(r.action_values, PURCHASE_TYPES),
      addToCart: pick(r.actions, ATC_TYPES),
      initiateCheckout: pick(r.actions, IC_TYPES),
    };
    await db.adInsight.upsert({
      where: { date_campaignId: { date, campaignId } },
      create: { date, campaignId, ...data },
      update: data,
    });
    count++;
  }
  return count;
}

export async function syncMeta(cfg: IntegrationConfig): Promise<{ campaigns: number; insights: number }> {
  const ids = await syncMetaCampaigns(cfg);
  // Meta restates the last few days as attribution windows close, so always
  // re-pull a trailing week. Pull 90 days on the first run.
  const since = cfg.lastMetaSyncAt ? subDays(cfg.lastMetaSyncAt, 7) : subDays(new Date(), 90);
  const insights = await syncMetaInsights(cfg, since, ids);
  await db.settings.update({ where: { id: "default" }, data: { lastMetaSyncAt: new Date() } });
  return { campaigns: ids.size, insights };
}

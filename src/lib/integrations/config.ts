import "server-only";
import type { Store } from "@prisma/client";
import { db } from "../db";
import { decrypt } from "../crypto";

/** Either a static legacy token or client credentials (token fetched on demand). */
export type ShopifyAuth =
  | { storeId: string; domain: string; kind: "static"; token: string }
  | { storeId: string; domain: string; kind: "client"; clientId: string; clientSecret: string };

/** One store's connection and cost assumptions, secrets decrypted. */
export type StoreConfig = {
  storeId: string;
  storeName: string;
  currency: string;
  timezone: string;
  shopify: ShopifyAuth | null;
  paymentFeePercent: number;
  paymentFeeFixed: number;
  platformFeePercent: number;
  defaultShippingCost: number;
  defaultHandlingCost: number;
  defaultCogsPercent: number;
  lastShopifySyncAt: Date | null;
};

/** One Meta ad account, token decrypted. */
export type AdAccountConfig = { id: string; adAccountId: string; token: string; lastSyncAt: Date | null };

/**
 * App-wide settings (notification keys, scheduler bookkeeping). Everything about a
 * store lives on Store; the old single-store columns are only read by the one-time move.
 */
export async function getSettingsRow() {
  return db.settings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
    select: { id: true, vapidPublicKey: true, vapidPrivateKey: true, lastTaskReminderAt: true, storesMigratedAt: true },
  });
}

/** The full original row, for copying the single-store setup into the first store. */
export async function getLegacySettings() {
  return db.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
}

export function storeConfig(s: Store): StoreConfig {
  const domain = normalizeDomain(s.shopifyDomain ?? "");
  const clientSecret = decrypt(s.shopifyClientSecret) ?? "";
  const staticToken = s.shopifyTokenExpires ? "" : decrypt(s.shopifyToken) ?? "";
  let shopify: ShopifyAuth | null = null;
  if (domain && s.shopifyClientId && clientSecret) shopify = { storeId: s.id, domain, kind: "client", clientId: s.shopifyClientId, clientSecret };
  else if (domain && staticToken) shopify = { storeId: s.id, domain, kind: "static", token: staticToken };
  return {
    storeId: s.id,
    storeName: s.name,
    currency: s.currency,
    timezone: s.timezone,
    shopify,
    paymentFeePercent: s.paymentFeePercent,
    paymentFeeFixed: s.paymentFeeFixed,
    platformFeePercent: s.platformFeePercent,
    defaultShippingCost: s.defaultShippingCost,
    defaultHandlingCost: s.defaultHandlingCost,
    defaultCogsPercent: s.defaultCogsPercent,
    lastShopifySyncAt: s.lastShopifySyncAt,
  };
}

export async function getStoreConfig(storeId: string): Promise<StoreConfig> {
  return storeConfig(await db.store.findUniqueOrThrow({ where: { id: storeId } }));
}

export async function getAdAccountConfigs(): Promise<AdAccountConfig[]> {
  const rows = await db.adAccount.findMany({ orderBy: { createdAt: "asc" } });
  return rows
    .map((a) => ({ id: a.id, adAccountId: normalizeAdAccount(a.metaAccountId), token: decrypt(a.token) ?? "", lastSyncAt: a.lastSyncAt }))
    .filter((a) => a.token);
}

export function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

export function normalizeAdAccount(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

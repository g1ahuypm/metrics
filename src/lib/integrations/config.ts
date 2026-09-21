import "server-only";
import { db } from "../db";
import { decrypt } from "../crypto";

export type IntegrationConfig = {
  storeName: string;
  currency: string;
  timezone: string;
  shopify: { domain: string; token: string } | null;
  meta: { adAccountId: string; token: string } | null;
  paymentFeePercent: number;
  paymentFeeFixed: number;
  platformFeePercent: number;
  defaultShippingCost: number;
  defaultHandlingCost: number;
  defaultCogsPercent: number;
  lastShopifySyncAt: Date | null;
  lastMetaSyncAt: Date | null;
};

export async function getSettingsRow() {
  return db.settings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

/** Settings row merged with environment fallbacks and decrypted tokens. */
export async function getIntegrationConfig(): Promise<IntegrationConfig> {
  const s = await getSettingsRow();

  const shopifyDomain = s.shopifyDomain || process.env.SHOPIFY_STORE_DOMAIN || "";
  const shopifyToken = decrypt(s.shopifyToken) || process.env.SHOPIFY_ACCESS_TOKEN || "";
  const metaAccount = s.metaAdAccountId || process.env.META_AD_ACCOUNT_ID || "";
  const metaToken = decrypt(s.metaToken) || process.env.META_ACCESS_TOKEN || "";

  return {
    storeName: s.storeName,
    currency: s.currency,
    timezone: s.timezone,
    shopify: shopifyDomain && shopifyToken ? { domain: normalizeDomain(shopifyDomain), token: shopifyToken } : null,
    meta: metaAccount && metaToken ? { adAccountId: normalizeAdAccount(metaAccount), token: metaToken } : null,
    paymentFeePercent: s.paymentFeePercent,
    paymentFeeFixed: s.paymentFeeFixed,
    platformFeePercent: s.platformFeePercent,
    defaultShippingCost: s.defaultShippingCost,
    defaultHandlingCost: s.defaultHandlingCost,
    defaultCogsPercent: s.defaultCogsPercent,
    lastShopifySyncAt: s.lastShopifySyncAt,
    lastMetaSyncAt: s.lastMetaSyncAt,
  };
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

import "server-only";
import { db } from "../db";
import { decrypt } from "../crypto";

/** Either a static legacy token or client credentials (token fetched on demand). */
export type ShopifyAuth =
  | { domain: string; kind: "static"; token: string }
  | { domain: string; kind: "client"; clientId: string; clientSecret: string };

export type IntegrationConfig = {
  storeName: string;
  currency: string;
  timezone: string;
  shopify: ShopifyAuth | null;
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

  const shopifyDomain = normalizeDomain(s.shopifyDomain || process.env.SHOPIFY_STORE_DOMAIN || "");
  const clientId = s.shopifyClientId || process.env.SHOPIFY_CLIENT_ID || "";
  const clientSecret = decrypt(s.shopifyClientSecret) || process.env.SHOPIFY_CLIENT_SECRET || "";
  const staticToken = s.shopifyTokenExpires ? "" : decrypt(s.shopifyToken) || process.env.SHOPIFY_ACCESS_TOKEN || "";
  let shopify: ShopifyAuth | null = null;
  if (shopifyDomain && clientId && clientSecret) shopify = { domain: shopifyDomain, kind: "client", clientId, clientSecret };
  else if (shopifyDomain && staticToken) shopify = { domain: shopifyDomain, kind: "static", token: staticToken };
  const metaAccount = s.metaAdAccountId || process.env.META_AD_ACCOUNT_ID || "";
  const metaToken = decrypt(s.metaToken) || process.env.META_ACCESS_TOKEN || "";

  return {
    storeName: s.storeName,
    currency: s.currency,
    timezone: s.timezone,
    shopify,
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

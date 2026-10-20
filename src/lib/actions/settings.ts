"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { requireEditor, requireSignedIn } from "../auth";
import { encrypt, decrypt } from "../crypto";
import { normalizeAdAccount, normalizeDomain, type ShopifyAuth } from "../integrations/config";
import { fetchClientCredentialsToken, testShopify } from "../integrations/shopify";
import { testMeta } from "../integrations/meta";
import { repriceOrders } from "../costbook";
import { allowedStores, recomputeCampaignStores, STORE_COLORS, STORE_COOKIE } from "../stores";
import type { FormState } from "./auth";

/** Owner and admins, and only for stores they can see. */
async function requireStoreEditor(storeId: string) {
  const me = await requireEditor();
  if (!(await allowedStores(me)).some((s) => s.id === storeId)) throw new Error("You don't have access to this store");
  return me;
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

/** Adds a store (owner only) and switches to it, so it can be connected right away. */
export async function addStoreAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSignedIn();
  if (me.role !== "OWNER") return { error: "Only the owner can add stores" };
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Give the store a name" };
  const existing = await db.store.findMany({ select: { sortOrder: true, color: true, timezone: true } });
  const used = new Set(existing.map((s) => s.color));
  const store = await db.store.create({
    data: {
      name,
      color: STORE_COLORS.find((c) => !used.has(c)) ?? STORE_COLORS[existing.length % STORE_COLORS.length],
      sortOrder: Math.max(-1, ...existing.map((s) => s.sortOrder)) + 1,
      timezone: existing[0]?.timezone ?? "UTC",
    },
  });
  (await cookies()).set(STORE_COOKIE, store.id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  revalidatePath("/", "layout");
  return { success: `${name} added. Connect its Shopify below.` };
}

export async function updateStoreDetailsAction(storeId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireStoreEditor(storeId);
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Store name is required").max(60),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
      currency: z.string().trim().toUpperCase().length(3, "Use a 3-letter currency code"),
      timezone: z.string().trim().min(1),
    })
    .safeParse({ name: formData.get("name"), color: formData.get("color"), currency: formData.get("currency"), timezone: formData.get("timezone") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.store.update({ where: { id: storeId }, data: parsed.data });
  revalidatePath("/", "layout");
  return { success: "Saved" };
}

export async function updateCostAssumptionsAction(storeId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireStoreEditor(storeId);
  const n = (k: string) => Number(formData.get(k) ?? 0);
  const parsed = z
    .object({
      paymentFeePercent: z.number().min(0).max(100),
      paymentFeeFixed: z.number().min(0),
      platformFeePercent: z.number().min(0).max(100),
      defaultShippingCost: z.number().min(0),
      defaultHandlingCost: z.number().min(0),
      defaultCogsPercent: z.number().min(0).max(100),
    })
    .safeParse({
      paymentFeePercent: n("paymentFeePercent"),
      paymentFeeFixed: n("paymentFeeFixed"),
      platformFeePercent: n("platformFeePercent"),
      defaultShippingCost: n("defaultShippingCost"),
      defaultHandlingCost: n("defaultHandlingCost"),
      defaultCogsPercent: n("defaultCogsPercent"),
    });
  if (!parsed.success) return { error: "Enter valid, non-negative numbers" };
  await db.store.update({ where: { id: storeId }, data: parsed.data });
  const { orders } = await repriceOrders({ storeId });
  revalidatePath("/", "layout");
  return { success: `Saved · ${orders} order${orders === 1 ? "" : "s"} updated` };
}

// ---------------------------------------------------------------------------
// Shopify (per store)
// ---------------------------------------------------------------------------

export async function connectShopifyAction(storeId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireStoreEditor(storeId);
  const domain = normalizeDomain(String(formData.get("domain") ?? ""));
  const clientId = String(formData.get("clientId") ?? "").trim();
  const clientSecret = String(formData.get("clientSecret") ?? "").trim();
  const legacyToken = String(formData.get("token") ?? "").trim();

  if (!domain.endsWith(".myshopify.com")) return { error: "Store domain should look like my-store.myshopify.com" };
  const taken = await db.store.findFirst({ where: { shopifyDomain: domain, id: { not: storeId } }, select: { name: true } });
  if (taken) return { error: `${domain} is already connected to ${taken.name}.` };

  let auth: ShopifyAuth;
  if (legacyToken) {
    if (/^shpss_/i.test(legacyToken)) {
      return { error: "That is a client secret, not a legacy token. Paste it in the Client secret field instead, together with the Client ID." };
    }
    if (!/^shpat_/i.test(legacyToken)) return { error: "A legacy Admin API access token starts with shpat_." };
    auth = { storeId, domain, kind: "static", token: legacyToken };
  } else {
    if (!clientId) return { error: "Enter the Client ID from Dev Dashboard → App settings → Credentials." };
    if (!clientSecret) return { error: "Enter the Client secret (starts with shpss_)." };
    if (/^shpat_/i.test(clientSecret)) return { error: "That is a legacy access token. Use the legacy token field below instead." };
    auth = { storeId, domain, kind: "client", clientId, clientSecret };
  }

  try {
    // Fresh token on every connect so a rotated secret is picked up immediately.
    if (auth.kind === "client") {
      const fresh = await fetchClientCredentialsToken(auth);
      await db.store.update({ where: { id: storeId }, data: { shopifyToken: encrypt(fresh.token), shopifyTokenExpires: fresh.expiresAt } });
    }
    const result = await testShopify(auth);
    const data =
      auth.kind === "client"
        ? { shopifyDomain: domain, shopifyClientId: auth.clientId, shopifyClientSecret: encrypt(auth.clientSecret) }
        : { shopifyDomain: domain, shopifyClientId: null, shopifyClientSecret: null, shopifyToken: encrypt(auth.token), shopifyTokenExpires: null };
    await db.store.update({ where: { id: storeId }, data });
    revalidatePath("/", "layout");
    if (result.missingScopes.length) {
      return {
        success: `Connected to ${result.label}, but the app is missing scopes: ${result.missingScopes.join(", ")}. Add them to a new version in the Dev Dashboard, release it, and reinstall the app. Then run a sync.`,
      };
    }
    return { success: `Connected to ${result.label}. Run a sync to import orders.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not connect to Shopify" };
  }
}

/** Stops syncing this store's Shopify. Synced orders are kept. */
export async function disconnectShopifyAction(storeId: string): Promise<void> {
  await requireStoreEditor(storeId);
  await db.store.update({
    where: { id: storeId },
    data: { shopifyDomain: null, shopifyClientId: null, shopifyClientSecret: null, shopifyToken: null, shopifyTokenExpires: null, lastShopifySyncAt: null },
  });
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Meta ad accounts (shared between stores)
// ---------------------------------------------------------------------------

async function cleanStoreIds(storeIds: string[]): Promise<string[]> {
  const me = await requireEditor();
  const allowed = new Set((await allowedStores(me)).map((s) => s.id));
  return [...new Set(storeIds)].filter((id) => allowed.has(id));
}

/**
 * Connects a Meta ad account and the stores that advertise from it. The token may be left
 * empty to reuse the token of an account already connected (one system user usually covers all).
 */
export async function addAdAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireEditor();
  const adAccountId = normalizeAdAccount(String(formData.get("adAccountId") ?? ""));
  let token = String(formData.get("token") ?? "").trim();
  const storeIds = await cleanStoreIds(formData.getAll("storeIds").map(String));
  if (adAccountId === "act_") return { error: "Enter the ad account ID" };
  if (storeIds.length === 0) return { error: "Tick at least one store that uses this ad account" };
  if (!token) {
    const other = await db.adAccount.findFirst({ where: { token: { not: null } }, orderBy: { createdAt: "asc" }, select: { token: true } });
    token = decrypt(other?.token) ?? "";
    if (!token) return { error: "Enter the Meta access token" };
  }
  try {
    const name = await testMeta({ adAccountId, token });
    const account = await db.adAccount.upsert({
      where: { metaAccountId: adAccountId },
      update: { token: encrypt(token), name },
      create: { metaAccountId: adAccountId, token: encrypt(token), name },
    });
    await db.storeAdAccount.deleteMany({ where: { adAccountId: account.id } });
    await db.storeAdAccount.createMany({ data: storeIds.map((storeId) => ({ storeId, adAccountId: account.id })) });
    await recomputeCampaignStores();
    revalidatePath("/", "layout");
    return { success: `Connected to ${name}. Run a sync to import its campaigns.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not connect to Meta" };
  }
}

/** Which stores advertise from this account. With one store its campaigns count for it automatically. */
export async function setAdAccountStoresAction(adAccountId: string, storeIds: string[]): Promise<FormState> {
  const ids = await cleanStoreIds(storeIds);
  if (ids.length === 0) return { error: "Tick at least one store" };
  await db.$transaction([
    db.storeAdAccount.deleteMany({ where: { adAccountId } }),
    db.storeAdAccount.createMany({ data: ids.map((storeId) => ({ storeId, adAccountId })) }),
  ]);
  await recomputeCampaignStores();
  revalidatePath("/", "layout");
  return { success: "Saved" };
}

export async function updateAdAccountTokenAction(adAccountId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireEditor();
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Paste the new access token" };
  const account = await db.adAccount.findUnique({ where: { id: adAccountId } });
  if (!account) return { error: "Ad account not found" };
  try {
    const name = await testMeta({ adAccountId: normalizeAdAccount(account.metaAccountId), token });
    await db.adAccount.update({ where: { id: adAccountId }, data: { token: encrypt(token), name } });
    revalidatePath("/", "layout");
    return { success: `Token updated for ${name}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not connect to Meta" };
  }
}

/** Stops syncing the account. Its campaigns and spend history are kept. */
export async function disconnectAdAccountAction(adAccountId: string): Promise<void> {
  await requireEditor();
  await db.adAccount.update({ where: { id: adAccountId }, data: { token: null } });
  revalidatePath("/", "layout");
}

import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Store } from "@prisma/client";
import { db } from "./db";
import { encrypt } from "./crypto";
import { getLegacySettings, normalizeAdAccount, normalizeDomain } from "./integrations/config";
import type { SessionUser } from "./auth-shared";
import { DEFAULT_SIGNATURE } from "./support/knowledge";

export const STORE_COOKIE = "pd_store";
export const ALL_STORES = "all";

/** Switcher dot colours, in the order new stores get them. */
export const STORE_COLORS = ["#6D4AFF", "#E8590C", "#0B7A6F", "#D6336C", "#1971C2", "#9C6B00", "#5F3DC4", "#2B8A3E"];

// ---------------------------------------------------------------------------
// One-time move from the single-store setup (everything on Settings) to stores
// ---------------------------------------------------------------------------

let ready: Promise<void> | null = null;

/** Makes sure at least one store exists. Cheap after the first call in a server instance. */
export function ensureStores(): Promise<void> {
  ready ??= migrate().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

async function migrate(): Promise<void> {
  if ((await db.store.count()) === 0) {
    // Only one server instance may create the first store; the others wait for it.
    const claimed = await db.settings.updateMany({ where: { id: "default", storesMigratedAt: null }, data: { storesMigratedAt: new Date() } });
    if (claimed.count === 1) await createFirstStore();
    else if ((await db.settings.count()) === 0) {
      await getLegacySettings();
      return migrate();
    } else {
      for (let i = 0; i < 20 && (await db.store.count()) === 0; i++) await new Promise((r) => setTimeout(r, 250));
    }
  }
  // While there is a single store, anything written without a store (by a server still running
  // the previous version during a deploy) belongs to it.
  const stores = await db.store.findMany({ select: { id: true } });
  if (stores.length === 1) await backfill(stores[0].id);
}

async function createFirstStore(): Promise<void> {
  const s = await getLegacySettings();
  const env = process.env;
  const encryptedEnv = (v: string | undefined) => (v ? encrypt(v) : null);
  const store = await db.store.create({
    data: {
      name: s.storeName,
      color: STORE_COLORS[0],
      sortOrder: 0,
      currency: s.currency,
      timezone: s.timezone,
      shopifyDomain: s.shopifyDomain ?? (env.SHOPIFY_STORE_DOMAIN ? normalizeDomain(env.SHOPIFY_STORE_DOMAIN) : null),
      shopifyClientId: s.shopifyClientId ?? (env.SHOPIFY_CLIENT_ID || null),
      shopifyClientSecret: s.shopifyClientSecret ?? encryptedEnv(env.SHOPIFY_CLIENT_SECRET),
      shopifyToken: s.shopifyToken ?? encryptedEnv(env.SHOPIFY_ACCESS_TOKEN),
      shopifyTokenExpires: s.shopifyTokenExpires,
      lastShopifySyncAt: s.lastShopifySyncAt,
      supportEmail: s.supportEmail,
      supportAppPassword: s.supportAppPassword,
      supportAutoReply: s.supportAutoReply,
      supportSignature: s.supportSignature ?? DEFAULT_SIGNATURE,
      supportAbout: 'an online store selling educational books (main product: "Winnie the Pooh: The Complete Stories and Poems")',
      supportUidValidity: s.supportUidValidity,
      supportLastUid: s.supportLastUid,
      lastSupportSyncAt: s.lastSupportSyncAt,
      paymentFeePercent: s.paymentFeePercent,
      paymentFeeFixed: s.paymentFeeFixed,
      platformFeePercent: s.platformFeePercent,
      defaultShippingCost: s.defaultShippingCost,
      defaultHandlingCost: s.defaultHandlingCost,
      defaultCogsPercent: s.defaultCogsPercent,
    },
  });

  const metaId = s.metaAdAccountId || env.META_AD_ACCOUNT_ID;
  const metaToken = s.metaToken ?? encryptedEnv(env.META_ACCESS_TOKEN);
  if (metaId) {
    const account = await db.adAccount.upsert({
      where: { metaAccountId: normalizeAdAccount(metaId) },
      update: {},
      create: { metaAccountId: normalizeAdAccount(metaId), token: metaToken, lastSyncAt: s.lastMetaSyncAt },
    });
    await db.storeAdAccount.create({ data: { storeId: store.id, adAccountId: account.id } });
    await db.campaign.updateMany({ where: { adAccountId: null }, data: { adAccountId: account.id } });
  }

  // Expenses entered before stores existed were this store's own.
  await db.customCost.updateMany({ where: { storeId: null }, data: { storeId: store.id } });
  // Everyone already on the team keeps seeing it.
  const members = await db.user.findMany({ where: { role: { not: "OWNER" } }, select: { id: true } });
  if (members.length) await db.userStore.createMany({ data: members.map((m) => ({ userId: m.id, storeId: store.id })), skipDuplicates: true });
  await backfill(store.id);
}

async function backfill(storeId: string): Promise<void> {
  const where = { storeId: null };
  const data = { storeId };
  await Promise.all([
    db.productVariant.updateMany({ where, data }),
    db.order.updateMany({ where, data }),
    db.supportThread.updateMany({ where, data }),
    db.supportMessage.updateMany({ where, data }),
    db.kbArticle.updateMany({ where, data }),
  ]);
  await recomputeCampaignStores();
}

/**
 * Which store each campaign's spend counts for: the store of the product it is linked to,
 * else the store of its ad account when only one store uses that account, else none.
 */
export async function recomputeCampaignStores(): Promise<void> {
  await db.$executeRaw`
    UPDATE "Campaign" c SET "storeId" = COALESCE(
      (SELECT pv."storeId" FROM "ProductVariant" pv WHERE pv."productId" = c."productId" AND pv."storeId" IS NOT NULL LIMIT 1),
      (SELECT MIN(sa."storeId") FROM "StoreAdAccount" sa WHERE sa."adAccountId" = c."adAccountId"
         HAVING COUNT(*) = 1)
    )`;
}

// ---------------------------------------------------------------------------
// Which stores a person sees, and which one they are looking at
// ---------------------------------------------------------------------------

/** Every store, in switcher order. Read once per page load. */
export const listStores = cache(async (): Promise<Store[]> => {
  await ensureStores();
  return db.store.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
});

/** The owner sees every store; everyone else the stores they were given. */
export function allowedStores(user: Pick<SessionUser, "id" | "role">): Promise<Store[]> {
  return allowedStoresFor(user.id, user.role);
}

const allowedStoresFor = cache(async (userId: string, role: string): Promise<Store[]> => {
  if (role === "OWNER") return listStores();
  const [stores, rows] = await Promise.all([listStores(), db.userStore.findMany({ where: { userId }, select: { storeId: true } })]);
  const mine = new Set(rows.map((r) => r.storeId));
  return stores.filter((s) => mine.has(s.id));
});

export type StoreScope = {
  /** Every store this person may see, in switcher order. */
  stores: Store[];
  /** The store being looked at, or null for "All stores". */
  store: Store | null;
  /** The stores the numbers on screen cover. */
  storeIds: string[];
  /** The time zone the date range is resolved in. */
  timezone: string;
};

/**
 * The store the whole app is looking at. Remembered per device in a cookie
 * (set by the switcher). Only the owner can look at "All stores" (the first time,
 * and whenever the remembered store is gone); everyone else always looks at one of
 * their own stores, the first one when nothing valid is remembered.
 */
export async function getStoreScope(user: Pick<SessionUser, "id" | "role">, override?: string): Promise<StoreScope> {
  const stores = await allowedStores(user);
  const wanted = override ?? (await cookies()).get(STORE_COOKIE)?.value ?? ALL_STORES;
  const picked = stores.find((s) => s.id === wanted) ?? null;
  const store = stores.length === 1 ? stores[0] : picked ?? (canSeeAllStores(user) ? null : stores[0] ?? null);
  const covered = store ? [store] : stores;
  return { stores, store, storeIds: covered.map((s) => s.id), timezone: (store ?? stores[0])?.timezone ?? "UTC" };
}

/** Only the owner sees every store added up ("All stores"). */
export function canSeeAllStores(user: Pick<SessionUser, "role">): boolean {
  return user.role === "OWNER";
}

/** True when the person may see this store. */
export async function canSeeStore(user: Pick<SessionUser, "id" | "role">, storeId: string | null | undefined): Promise<boolean> {
  if (!storeId) return user.role === "OWNER";
  return (await allowedStores(user)).some((s) => s.id === storeId);
}

/** The main store's time zone, for people whose own time zone isn't known yet. */
export async function firstStoreTimezone(): Promise<string> {
  const s = (await listStores())[0];
  return s?.timezone ?? "UTC";
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { requireEditor } from "../auth";
import { encrypt } from "../crypto";
import { normalizeAdAccount, normalizeDomain } from "../integrations/config";
import { testShopify } from "../integrations/shopify";
import { testMeta } from "../integrations/meta";
import type { FormState } from "./auth";

export async function updateGeneralSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireEditor();
  const parsed = z
    .object({
      storeName: z.string().trim().min(1, "Store name is required"),
      currency: z.string().trim().toUpperCase().length(3, "Use a 3-letter currency code"),
      timezone: z.string().trim().min(1),
    })
    .safeParse({
      storeName: formData.get("storeName"),
      currency: formData.get("currency"),
      timezone: formData.get("timezone"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.settings.upsert({
    where: { id: "default" },
    update: parsed.data,
    create: { id: "default", ...parsed.data },
  });
  revalidatePath("/", "layout");
  return { success: "Settings saved" };
}

export async function updateCostAssumptionsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireEditor();
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
  await db.settings.upsert({
    where: { id: "default" },
    update: parsed.data,
    create: { id: "default", ...parsed.data },
  });
  revalidatePath("/", "layout");
  return { success: "Cost assumptions saved. They apply to orders synced from now on." };
}

export async function connectShopifyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireEditor();
  const domain = normalizeDomain(String(formData.get("domain") ?? ""));
  const token = String(formData.get("token") ?? "").trim();
  if (!domain.endsWith(".myshopify.com")) return { error: "Store domain should look like my-store.myshopify.com" };
  if (!token) return { error: "Enter the Admin API access token" };
  try {
    const shop = await testShopify({ domain, token });
    await db.settings.upsert({
      where: { id: "default" },
      update: { shopifyDomain: domain, shopifyToken: encrypt(token) },
      create: { id: "default", shopifyDomain: domain, shopifyToken: encrypt(token) },
    });
    revalidatePath("/", "layout");
    return { success: `Connected to ${shop}. Run a sync to import orders.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not connect to Shopify" };
  }
}

export async function connectMetaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireEditor();
  const adAccountId = normalizeAdAccount(String(formData.get("adAccountId") ?? ""));
  const token = String(formData.get("token") ?? "").trim();
  if (adAccountId === "act_") return { error: "Enter your ad account ID" };
  if (!token) return { error: "Enter the Meta access token" };
  try {
    const account = await testMeta({ adAccountId, token });
    await db.settings.upsert({
      where: { id: "default" },
      update: { metaAdAccountId: adAccountId, metaToken: encrypt(token) },
      create: { id: "default", metaAdAccountId: adAccountId, metaToken: encrypt(token) },
    });
    revalidatePath("/", "layout");
    return { success: `Connected to ${account}. Run a sync to import campaigns.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not connect to Meta" };
  }
}

export async function disconnectAction(source: "shopify" | "meta"): Promise<void> {
  await requireEditor();
  await db.settings.update({
    where: { id: "default" },
    data:
      source === "shopify"
        ? { shopifyDomain: null, shopifyToken: null, lastShopifySyncAt: null }
        : { metaAdAccountId: null, metaToken: null, lastMetaSyncAt: null },
  });
  revalidatePath("/", "layout");
}

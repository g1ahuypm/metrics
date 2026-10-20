"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { allowedStores, canSeeStore, listStores } from "../stores";
import { requireEditor } from "../auth";
import { parseISODate } from "../dates";
import { COST_TYPES } from "../constants";
import { repriceOrders } from "../costbook";
import type { FormState } from "./auth";

// ---------------------------------------------------------------------------
// Supplier cost tiers
// ---------------------------------------------------------------------------

const tierSchema = z
  .array(
    z.object({
      quantity: z.number().int().min(1).max(1000),
      productCost: z.number().min(0),
      shippingCost: z.number().min(0),
    }),
  )
  .max(50);

export type TierInput = z.infer<typeof tierSchema>[number];

/** "Saved · 37 orders updated" — so the owner sees that past orders were re-priced. */
function repricedMessage(saved: string, orders: number): string {
  if (orders === 0) return `${saved} · no orders yet`;
  return `${saved} · ${orders} order${orders === 1 ? "" : "s"} updated`;
}

/** Replaces the tiers for a product (variantId = "") or one variant, for one country ("" = default). */
export async function saveTiersAction(productId: string, variantId: string, tiers: TierInput[], country = ""): Promise<FormState> {
  await requireEditor();
  if (!/^[A-Z]{2}$|^$/.test(country)) return { error: "Unknown country" };
  const parsed = tierSchema.safeParse(tiers);
  if (!parsed.success) return { error: "Enter whole quantities and non-negative costs" };
  const seen = new Set<number>();
  for (const t of parsed.data) {
    if (seen.has(t.quantity)) return { error: `Quantity ${t.quantity} is listed twice` };
    seen.add(t.quantity);
  }
  await db.$transaction([
    db.costTier.deleteMany({ where: { productId, variantId, country } }),
    ...parsed.data.map((t) => db.costTier.create({ data: { productId, variantId, country, quantity: t.quantity, productCost: t.productCost, shippingCost: t.shippingCost } })),
  ]);
  const { orders } = await repriceOrders({ productIds: [productId] });
  revalidatePath("/", "layout");
  return { success: repricedMessage(parsed.data.length ? "Saved" : "Cleared", orders) };
}

/** Removes a variant's own tiers for one country (or all countries) so it falls back to the product-level tiers. */
export async function clearVariantTiersAction(productId: string, variantId: string, country?: string): Promise<FormState> {
  await requireEditor();
  await db.costTier.deleteMany({ where: { productId, variantId, ...(country === undefined ? {} : { country }) } });
  const { orders } = await repriceOrders({ productIds: [productId] });
  revalidatePath("/", "layout");
  return { success: repricedMessage("Using product costs", orders) };
}

// ---------------------------------------------------------------------------
// Custom costs (expenses)
// ---------------------------------------------------------------------------

export async function addCustomCostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireEditor();
  // "" = shared by all stores (split by each store's revenue); only someone who sees every store may add one.
  const storeId = String(formData.get("storeId") ?? "") || null;
  const visible = await allowedStores(me);
  if (storeId ? !visible.some((s) => s.id === storeId) : visible.length !== (await listStores()).length) {
    return { error: "You can't add expenses for that store" };
  }
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Name is required"),
      category: z.string().trim().min(1).default("Other"),
      type: z.enum(COST_TYPES),
      amount: z.number().min(0, "Amount must be positive"),
      startDate: z.date(),
      endDate: z.date().nullable(),
      notes: z.string().trim().optional(),
    })
    .safeParse({
      name: formData.get("name"),
      category: formData.get("category") || "Other",
      type: formData.get("type"),
      amount: Number(formData.get("amount")),
      startDate: parseISODate(String(formData.get("startDate") ?? "")),
      endDate: parseISODate(String(formData.get("endDate") ?? "")),
      notes: formData.get("notes") ?? "",
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.endDate && parsed.data.endDate < parsed.data.startDate) {
    return { error: "End date must be after the start date" };
  }
  await db.customCost.create({ data: { ...parsed.data, storeId } });
  revalidatePath("/", "layout");
  return { success: "Expense added" };
}

export async function deleteCustomCostAction(id: string): Promise<void> {
  const me = await requireEditor();
  const cost = await db.customCost.findUnique({ where: { id }, select: { storeId: true } });
  if (!cost || !(await canSeeStore(me, cost.storeId))) return;
  await db.customCost.delete({ where: { id } });
  revalidatePath("/", "layout");
}

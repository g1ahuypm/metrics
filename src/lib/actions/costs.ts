"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { requireEditor } from "../auth";
import { parseISODate } from "../dates";
import { COST_TYPES } from "../constants";
import { recostAllOrders } from "../costbook";
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

/** Replaces the tiers for a product (variantId = "") or one variant. */
export async function saveTiersAction(productId: string, variantId: string, tiers: TierInput[]): Promise<FormState> {
  await requireEditor();
  const parsed = tierSchema.safeParse(tiers);
  if (!parsed.success) return { error: "Enter whole quantities and non-negative costs" };
  const seen = new Set<number>();
  for (const t of parsed.data) {
    if (seen.has(t.quantity)) return { error: `Quantity ${t.quantity} is listed twice` };
    seen.add(t.quantity);
  }
  await db.$transaction([
    db.costTier.deleteMany({ where: { productId, variantId } }),
    ...parsed.data.map((t) => db.costTier.create({ data: { productId, variantId, ...t } })),
  ]);
  revalidatePath("/", "layout");
  return { success: parsed.data.length ? "Costs saved" : "Costs cleared" };
}

/** Removes a variant's own tiers so it falls back to the product-level tiers. */
export async function clearVariantTiersAction(productId: string, variantId: string): Promise<void> {
  await requireEditor();
  await db.costTier.deleteMany({ where: { productId, variantId } });
  revalidatePath("/", "layout");
}

/** Re-prices every stored order with the current tiers. */
export async function recostOrdersAction(): Promise<{ orders: number }> {
  await requireEditor();
  const orders = await recostAllOrders();
  revalidatePath("/", "layout");
  return { orders };
}

// ---------------------------------------------------------------------------
// Custom costs (expenses)
// ---------------------------------------------------------------------------

export async function addCustomCostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireEditor();
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
  await db.customCost.create({ data: parsed.data });
  revalidatePath("/", "layout");
  return { success: "Expense added" };
}

export async function deleteCustomCostAction(id: string): Promise<void> {
  await requireEditor();
  await db.customCost.delete({ where: { id } });
  revalidatePath("/", "layout");
}

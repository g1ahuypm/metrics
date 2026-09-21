"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { requireEditor } from "../auth";
import { parseISODate } from "../dates";
import type { FormState } from "./auth";

import { COST_TYPES } from "../constants";

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
  return { success: "Cost added" };
}

export async function deleteCustomCostAction(id: string): Promise<void> {
  await requireEditor();
  await db.customCost.delete({ where: { id } });
  revalidatePath("/", "layout");
}

export async function updateVariantCostAction(variantId: string, unitCost: number | null): Promise<void> {
  await requireEditor();
  await db.productVariant.update({
    where: { id: variantId },
    data: unitCost === null ? { unitCost: null, costSource: "shopify" } : { unitCost, costSource: "manual" },
  });
  revalidatePath("/", "layout");
}

/**
 * Re-applies the current per-variant unit costs to historical order line items and
 * recalculates each order's COGS. Useful after entering costs by hand.
 */
export async function recalculateCogsAction(): Promise<{ orders: number }> {
  await requireEditor();
  const variants = await db.productVariant.findMany({ select: { id: true, unitCost: true } });
  const costs = new Map(variants.map((v) => [v.id, v.unitCost ?? 0]));
  const orders = await db.order.findMany({ select: { id: true, lineItems: { select: { id: true, variantId: true, quantity: true, unitCost: true } } } });
  let updated = 0;
  for (const o of orders) {
    let cogs = 0;
    const updates = [];
    for (const li of o.lineItems) {
      const unitCost = li.variantId ? (costs.get(li.variantId) ?? li.unitCost) : li.unitCost;
      cogs += unitCost * li.quantity;
      if (unitCost !== li.unitCost) updates.push(db.orderLineItem.update({ where: { id: li.id }, data: { unitCost } }));
    }
    updates.push(db.order.update({ where: { id: o.id }, data: { cogs } }));
    await db.$transaction(updates);
    updated++;
  }
  revalidatePath("/", "layout");
  return { orders: updated };
}

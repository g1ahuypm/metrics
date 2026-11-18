"use server";

import { revalidatePath } from "next/cache";
import { addBusinessDays, format } from "date-fns";
import { z } from "zod";
import { db } from "../db";
import { requireEditor } from "../auth";
import { canSeeStore } from "../stores";
import { getStoreConfig } from "../integrations/config";
import { syncRefunds } from "../refunds/sync";
import { refundEmail, type EmailOptions } from "../refunds/email";
import { withSignature } from "../support/run";
import type { FormState } from "./auth";

const CHOICES = ["needed", "not_needed", "received"] as const;

/**
 * Writes the refund confirmation as a draft in the customer's Support conversation (or a new one).
 * Only for a refund Shopify shows as processed, and only once per refund.
 */
export async function draftRefundEmailAction(refundId: string, opts: EmailOptions): Promise<FormState & { threadId?: string }> {
  const me = await requireEditor();
  const choice = opts?.choice;
  if (!CHOICES.includes(choice)) return { error: "Pick whether the items come back" };
  const r = await db.refund.findUnique({ where: { id: refundId }, include: { store: true } });
  if (!r || !(await canSeeStore(me, r.storeId))) return { error: "Refund not found" };
  if (r.status === "failed") return { error: "This refund failed in Shopify, so there is nothing to confirm." };
  if (r.emailDraftedAt && r.emailThreadId) return { error: "The email for this refund was already written.", threadId: r.emailThreadId };
  if (!r.customerEmail) return { error: "This order has no customer email in Shopify." };

  const body = withSignature(
    refundEmail(r, { choice, apology: Boolean(opts.apology), extra: Boolean(opts.extra) }, { closing: r.store.refundEmailClosing, extra: r.store.refundEmailExtra, itemsWord: r.store.refundItemsWord }),
    r.store,
  );
  const due = format(addBusinessDays(new Date(), 3), "EEE MMM d");
  const actionNote = choice === "needed" ? `Email return instructions for ${r.orderName} (promised within 2–3 business days, by ${due}).` : null;
  // The customer's latest conversation, so the confirmation lands where they already wrote; else a new one.
  const existing = await db.supportThread.findFirst({
    where: { storeId: r.storeId, customerEmail: r.customerEmail, category: { not: "other" } },
    orderBy: { lastMessageAt: "desc" },
  });
  const thread = existing
    ? await db.supportThread.update({
        where: { id: existing.id },
        data: { draft: body, status: "needs_reply", holdReason: null, actionNote, category: "customer" },
      })
    : await db.supportThread.create({
        data: {
          storeId: r.storeId,
          key: `refund:${r.id}`,
          subject: `Your refund for order ${r.orderName}`,
          customerEmail: r.customerEmail,
          customerName: r.customerName,
          category: "customer",
          status: "needs_reply",
          summary: `Refund confirmation for ${r.orderName}`,
          orderNames: r.orderName,
          draft: body,
          actionNote,
          unread: false,
          lastMessageAt: new Date(),
        },
      });
  await db.refund.update({ where: { id: r.id }, data: { returnStatus: choice, emailThreadId: thread.id, emailDraftedAt: new Date() } });
  revalidatePath("/refunds");
  revalidatePath("/support", "layout");
  return { success: "Draft ready in Support", threadId: thread.id };
}

/** The team's progress on getting the items back. */
export async function setReturnStatusAction(refundId: string, status: "needed" | "instructions_sent" | "received" | "not_needed"): Promise<void> {
  const me = await requireEditor();
  if (!["needed", "instructions_sent", "received", "not_needed"].includes(status)) return;
  const r = await db.refund.findUnique({ where: { id: refundId }, select: { storeId: true } });
  if (!r || !(await canSeeStore(me, r.storeId))) return;
  await db.refund.update({ where: { id: refundId }, data: { returnStatus: status } });
  revalidatePath("/refunds");
}

const plannedSchema = z.object({
  orderName: z.string().trim().min(2, "Enter the order number").max(40),
  note: z.string().trim().max(300),
});

/** "Another refund is coming": listed until Shopify shows a refund on that order. */
export async function addPlannedRefundAction(storeId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireEditor();
  if (!(await canSeeStore(me, storeId))) return { error: "Pick a store you can see" };
  const parsed = plannedSchema.safeParse({ orderName: formData.get("orderName") ?? "", note: formData.get("note") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the order number" };
  const name = parsed.data.orderName.startsWith("#") ? parsed.data.orderName : `#${parsed.data.orderName}`;
  await db.plannedRefund.create({ data: { storeId, orderName: name.toUpperCase(), note: parsed.data.note || null, addedBy: me.name } });
  revalidatePath("/refunds");
  return { success: "Added" };
}

export async function removePlannedRefundAction(id: string): Promise<void> {
  const me = await requireEditor();
  const p = await db.plannedRefund.findUnique({ where: { id }, select: { storeId: true } });
  if (!p || !(await canSeeStore(me, p.storeId))) return;
  await db.plannedRefund.delete({ where: { id } });
  revalidatePath("/refunds");
}

/** The last paragraph of this store's refund emails (apology, coupon, what's new). */
export async function saveRefundClosingAction(storeId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireEditor();
  if (!(await canSeeStore(me, storeId))) return { error: "Pick a store you can see" };
  const text = String(formData.get("closing") ?? "").trim().slice(0, 600);
  const extra = String(formData.get("extra") ?? "").trim().slice(0, 600);
  const itemsWord = String(formData.get("itemsWord") ?? "").trim().slice(0, 30);
  await db.store.update({ where: { id: storeId }, data: { refundEmailClosing: text || null, refundEmailExtra: extra || null, refundItemsWord: itemsWord || null } });
  revalidatePath("/refunds");
  return { success: "Saved. New refund emails use it." };
}

/** "Check Shopify now": refunds normally come in with every scheduled sync. */
export async function checkRefundsNowAction(storeIds: string[]): Promise<FormState> {
  const me = await requireEditor();
  let n = 0;
  for (const id of storeIds) {
    if (!(await canSeeStore(me, id))) continue;
    const cfg = await getStoreConfig(id);
    if (!cfg.shopify) continue;
    try {
      n += await syncRefunds(cfg);
    } catch (err) {
      return { error: `Shopify: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300) };
    }
  }
  revalidatePath("/refunds");
  return { success: n ? `Up to date (${n} refund${n === 1 ? "" : "s"} checked)` : "Up to date" };
}

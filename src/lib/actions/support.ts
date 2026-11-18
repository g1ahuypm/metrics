"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { decrypt, encrypt } from "../crypto";
import { requireEditor, requireSupport, type SessionUser } from "../auth";
import { canSeeStore, getStoreScope } from "../stores";
import { getMailConfig, mailServers, testMailbox } from "../support/mail";
import { decideThread, decisionNeeded, runSupport, sendThreadReply, withSignature } from "../support/run";
import { OFF_TODO } from "../support/todo";
import { runTest, type TestCase, type TestOutcome } from "../support/aitest";
import { FIXTURES } from "../support/fixtures";
import { findOrders } from "../support/orders";
import type { FormState } from "./auth";

const STATUSES = ["new", "auto_replied", "needs_reply", "needs_action", "replied", "done"] as const;

/** The thread's store, when this person may see it. */
async function threadStore(me: SessionUser, threadId: string): Promise<string | null> {
  const t = await db.supportThread.findUnique({ where: { id: threadId }, select: { storeId: true } });
  return t?.storeId && (await canSeeStore(me, t.storeId)) ? t.storeId : null;
}

/** Sends what the team member wrote (or approved) to the customer. */
export async function sendSupportReplyAction(threadId: string, text: string): Promise<FormState> {
  const me = await requireSupport();
  if (text.trim().length < 2) return { error: "Write a reply first" };
  const storeId = await threadStore(me, threadId);
  if (!storeId) return { error: "This email is not in a store you can see" };
  const cfg = await getMailConfig(storeId);
  if (!cfg) return { error: "The support mailbox is not connected (Settings → Support)." };
  try {
    await sendThreadReply(cfg, threadId, text.trim(), me.name);
  } catch (err) {
    return { error: `Sending failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300) };
  }
  const thread = await db.supportThread.findUnique({ where: { id: threadId }, select: { actionNote: true } });
  await db.supportThread.update({
    where: { id: threadId },
    // Answered by a person: off the To do list.
    data: { status: thread?.actionNote ? "needs_action" : "replied", draft: null, holdReason: null, category: "customer", unread: false, ...OFF_TODO },
  });
  // A refund confirmation written from the Refunds page is now sent.
  await db.refund.updateMany({ where: { emailThreadId: threadId, emailDraftedAt: { not: null }, emailSentAt: null }, data: { emailSentAt: new Date() } });
  revalidatePath("/support", "layout");
  revalidatePath("/refunds");
  return { success: "Sent" };
}

/** Writes (or rewrites) a reply with the AI. Never sends. */
export async function draftWithAiAction(threadId: string): Promise<FormState & { draft?: string }> {
  const me = await requireSupport();
  if (!(await threadStore(me, threadId))) return { error: "This email is not in a store you can see" };
  const { thread, settings, kb, result } = await decideThread(threadId);
  if (!result.ok) return { error: result.error };
  const d = result.decision;
  if (!d.reply.trim()) return { error: "The AI thinks this is not a customer email, so it wrote nothing. Write the reply yourself if it is." };
  const draft = withSignature(d.reply, settings);
  const article = kb.find((a) => a.key === d.topic);
  const waiting = thread.status === "needs_reply" || thread.status === "new";
  await db.supportThread.update({
    where: { id: thread.id },
    data: {
      draft,
      summary: d.summary,
      topic: article?.key ?? null,
      category: "customer",
      ...(d.upset ? { urgent: true } : {}),
      // Only for an email still waiting for an answer: the label and team note follow the new draft.
      ...(waiting ? { holdReason: thread.holdReason?.startsWith("Arrived before Support") ? thread.holdReason : decisionNeeded(d, article), actionNote: d.teamAction.trim() || (article?.flagForTeam ? d.summary : "") || null } : {}),
    },
  });
  revalidatePath("/support", "layout");
  return { success: "Draft ready", draft };
}

export async function setThreadStatusAction(threadId: string, status: string): Promise<void> {
  const me = await requireSupport();
  if (!(STATUSES as readonly string[]).includes(status) || !(await threadStore(me, threadId))) return;
  await db.supportThread.update({ where: { id: threadId }, data: { status, ...(status === "done" ? { actionNote: null, ...OFF_TODO } : {}) } });
  revalidatePath("/support", "layout");
}

/** Moves a thread between "Customers" and "Not customers". */
export async function setThreadCategoryAction(threadId: string, category: "customer" | "other"): Promise<void> {
  const me = await requireSupport();
  if (!(await threadStore(me, threadId))) return;
  await db.supportThread.update({
    where: { id: threadId },
    data: category === "other" ? { category, status: "done", draft: null, ...OFF_TODO } : { category, status: "needs_reply", holdReason: "Moved to customers by the team" },
  });
  revalidatePath("/support", "layout");
}

const todoSchema = z.object({ note: z.string().trim().max(300, "Keep the note under 300 characters"), urgent: z.boolean() });

/** Puts an email on the team's To do list (or updates its note), so someone comes back to it. */
export async function saveTodoAction(threadId: string, input: z.infer<typeof todoSchema>): Promise<FormState> {
  const me = await requireSupport();
  const parsed = todoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the note" };
  if (!(await threadStore(me, threadId))) return { error: "This email is not in a store you can see" };
  const t = await db.supportThread.findUnique({ where: { id: threadId }, select: { todoAt: true, todoAuto: true } });
  await db.supportThread.update({
    where: { id: threadId },
    data: {
      todoNote: parsed.data.note || null,
      urgent: parsed.data.urgent,
      // Whoever saves it owns it from now on (reminders go to them).
      todoById: me.id,
      todoByName: me.name,
      ...(t?.todoAt ? {} : { todoAt: new Date() }),
      todoAuto: false,
    },
  });
  revalidatePath("/support", "layout");
  return { success: t?.todoAt ? "To do updated" : "Added to To do" };
}

/** Takes an email off the To do list without answering it. */
export async function removeTodoAction(threadId: string): Promise<void> {
  const me = await requireSupport();
  if (!(await threadStore(me, threadId))) return;
  await db.supportThread.update({ where: { id: threadId }, data: OFF_TODO });
  revalidatePath("/support", "layout");
}

/** "Check mail now": fetch and answer new emails immediately. */
export async function checkSupportNowAction(): Promise<FormState> {
  const me = await requireSupport();
  const scope = await getStoreScope(me);
  const stores = scope.stores.filter((s) => scope.storeIds.includes(s.id) && s.supportEmail && s.supportAppPassword);
  if (stores.length === 0) return { error: "No support mailbox is connected for this store yet." };
  const lines: string[] = [];
  try {
    for (const s of stores) {
      const r = await runSupport(s.id);
      lines.push(stores.length > 1 ? `${s.name}: ${r.message}` : r.message);
    }
    revalidatePath("/support", "layout");
    return { success: lines.join(" · ") };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

const articleSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(2, "Give it a title"),
  whenToUse: z.string().trim().min(5, "Say which questions it answers"),
  answer: z.string().trim().min(10, "Write the answer"),
  autoSend: z.boolean(),
  flagForTeam: z.boolean(),
});

export async function saveArticleAction(storeId: string, input: z.infer<typeof articleSchema>): Promise<FormState> {
  const me = await requireSupport();
  if (!(await canSeeStore(me, storeId))) return { error: "You can't edit this store's knowledge base" };
  const parsed = articleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...data } = parsed.data;
  if (id) await db.kbArticle.updateMany({ where: { id, storeId }, data });
  else {
    const base = data.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "topic";
    let key = base;
    for (let n = 2; await db.kbArticle.findUnique({ where: { storeId_key: { storeId, key } } }); n++) key = `${base}_${n}`;
    const last = await db.kbArticle.findFirst({ where: { storeId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    await db.kbArticle.create({ data: { ...data, storeId, key, sortOrder: (last?.sortOrder ?? 0) + 1 } });
  }
  revalidatePath("/support/knowledge");
  return { success: "Saved. The AI uses it from the next email." };
}

export async function deleteArticleAction(id: string): Promise<void> {
  const me = await requireSupport();
  const a = await db.kbArticle.findUnique({ where: { id }, select: { storeId: true } });
  if (!a || !(await canSeeStore(me, a.storeId))) return;
  await db.kbArticle.delete({ where: { id } });
  revalidatePath("/support/knowledge");
}

// ---------------------------------------------------------------------------
// Settings (owner and admins)
// ---------------------------------------------------------------------------

export async function saveSupportSettingsAction(storeId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireEditor();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").replace(/\s+/g, "");
  const signature = String(formData.get("signature") ?? "").trim();
  const about = String(formData.get("about") ?? "").trim().slice(0, 300);
  if (!z.string().email().safeParse(email).success) return { error: "Enter the support Gmail address" };

  const current = await db.store.findUnique({ where: { id: storeId }, select: { supportEmail: true, supportAppPassword: true } });
  if (!current) return { error: "Store not found" };
  if (!password && !current?.supportAppPassword) return { error: "Paste the 16-letter app password from Google" };
  if (password && !/^[a-z]{16}$/i.test(password)) {
    return { error: "A Google app password is 16 letters (spaces don't matter). Your normal Gmail password won't work here." };
  }
  if (password || email !== current?.supportEmail) {
    const check = await testMailbox({ email, password: password || decrypt(current?.supportAppPassword) || "", ...mailServers() });
    if (!check.ok) return { error: check.error };
  }
  await db.store.update({
    where: { id: storeId },
    data: {
      supportEmail: email,
      ...(password ? { supportAppPassword: encrypt(password) } : {}),
      // A different mailbox starts fresh from its last 14 days.
      ...(email !== current?.supportEmail ? { supportUidValidity: null, supportLastUid: null } : {}),
      // The AI never sends by itself (owner's rule, Nov 2026); the column stays only for older data.
      supportAutoReply: false,
      supportSignature: signature || null,
      supportAbout: about || null,
    },
  });
  revalidatePath("/", "layout");
  return { success: "Connected. New emails are checked every few minutes." };
}

// ---------------------------------------------------------------------------
// Test the AI (owner and admins): runs an email through the AI, stores and sends nothing
// ---------------------------------------------------------------------------

const customTestSchema = z.object({
  name: z.string().trim().max(100),
  email: z.string().trim().toLowerCase().email("Enter the customer's email address"),
  subject: z.string().trim().max(200),
  earlier: z.string().trim().max(5000),
  message: z.string().trim().min(2, "Paste the customer's email").max(8000),
  realOrders: z.boolean(),
});

export type AiTestResult = { error?: string; current?: TestOutcome; previous?: TestOutcome };

export async function runAiTestAction(
  storeId: string,
  input: { fixtureId: string } | { custom: z.infer<typeof customTestSchema> },
  compare: boolean,
): Promise<AiTestResult> {
  const me = await requireEditor();
  if (!(await canSeeStore(me, storeId))) return { error: "Pick a store you can see" };
  let tc: TestCase;
  if ("fixtureId" in input) {
    const f = FIXTURES.find((x) => x.id === input.fixtureId);
    if (!f) return { error: "Unknown test" };
    tc = f;
  } else {
    const parsed = customTestSchema.safeParse(input.custom);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the email" };
    const c = parsed.data;
    const now = Date.now();
    const thread = [
      ...(c.earlier ? [{ direction: "in" as const, sentAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), text: c.earlier }] : []),
      { direction: "in" as const, sentAt: new Date(now).toISOString(), text: c.message },
    ];
    const found = c.realOrders ? await findOrders(storeId, c.email, `${c.subject}\n${c.earlier}\n${c.message}`) : { orders: [], unmatched: [] };
    tc = { customerName: c.name || null, customerEmail: c.email, subject: c.subject || "(no subject)", thread, orders: found.orders, unmatched: found.unmatched, today: new Date(now).toISOString().slice(0, 10) };
  }
  const [current, previous] = await Promise.all([runTest(storeId, tc, "current"), compare ? runTest(storeId, tc, "previous") : Promise.resolve(undefined)]);
  return { current, previous };
}

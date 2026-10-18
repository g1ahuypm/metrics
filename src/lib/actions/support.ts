"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { decrypt, encrypt } from "../crypto";
import { requireEditor, requireSupport } from "../auth";
import { getMailConfig, mailServers, testMailbox } from "../support/mail";
import { decideThread, runSupport, sendThreadReply, withSignature } from "../support/run";
import type { FormState } from "./auth";

const STATUSES = ["new", "auto_replied", "needs_reply", "needs_action", "replied", "done"] as const;

/** Sends what the team member wrote (or approved) to the customer. */
export async function sendSupportReplyAction(threadId: string, text: string): Promise<FormState> {
  const me = await requireSupport();
  if (text.trim().length < 2) return { error: "Write a reply first" };
  const cfg = await getMailConfig();
  if (!cfg) return { error: "The support mailbox is not connected (Settings → Support)." };
  try {
    await sendThreadReply(cfg, threadId, text.trim(), me.name);
  } catch (err) {
    return { error: `Sending failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300) };
  }
  const thread = await db.supportThread.findUnique({ where: { id: threadId }, select: { actionNote: true } });
  await db.supportThread.update({
    where: { id: threadId },
    data: { status: thread?.actionNote ? "needs_action" : "replied", draft: null, holdReason: null, category: "customer", unread: false },
  });
  revalidatePath("/support", "layout");
  return { success: "Sent" };
}

/** Writes (or rewrites) a reply with the AI. Never sends. */
export async function draftWithAiAction(threadId: string): Promise<FormState & { draft?: string }> {
  await requireSupport();
  const { thread, settings, result } = await decideThread(threadId);
  if (!result.ok) return { error: result.error };
  const d = result.decision;
  if (!d.reply.trim()) return { error: "The AI thinks this is not a customer email, so it wrote nothing. Write the reply yourself if it is." };
  const draft = withSignature(d.reply, settings.supportSignature);
  await db.supportThread.update({
    where: { id: thread.id },
    data: { draft, summary: d.summary, topic: d.topic === "none" ? null : d.topic, category: "customer" },
  });
  revalidatePath("/support", "layout");
  return { success: "Draft ready", draft };
}

export async function setThreadStatusAction(threadId: string, status: string): Promise<void> {
  await requireSupport();
  if (!(STATUSES as readonly string[]).includes(status)) return;
  await db.supportThread.update({ where: { id: threadId }, data: { status, ...(status === "done" ? { actionNote: null } : {}) } });
  revalidatePath("/support", "layout");
}

/** Moves a thread between "Customers" and "Not customers". */
export async function setThreadCategoryAction(threadId: string, category: "customer" | "other"): Promise<void> {
  await requireSupport();
  await db.supportThread.update({
    where: { id: threadId },
    data: category === "other" ? { category, status: "done", draft: null } : { category, status: "needs_reply", holdReason: "Moved to customers by the team" },
  });
  revalidatePath("/support", "layout");
}

/** "Check mail now": fetch and answer new emails immediately. */
export async function checkSupportNowAction(): Promise<FormState> {
  await requireSupport();
  try {
    const r = await runSupport();
    revalidatePath("/support", "layout");
    return { success: r.message };
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

export async function saveArticleAction(input: z.infer<typeof articleSchema>): Promise<FormState> {
  await requireSupport();
  const parsed = articleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...data } = parsed.data;
  if (id) await db.kbArticle.update({ where: { id }, data });
  else {
    const base = data.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "topic";
    let key = base;
    for (let n = 2; await db.kbArticle.findUnique({ where: { key } }); n++) key = `${base}_${n}`;
    const last = await db.kbArticle.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    await db.kbArticle.create({ data: { ...data, key, sortOrder: (last?.sortOrder ?? 0) + 1 } });
  }
  revalidatePath("/support/knowledge");
  return { success: "Saved. The AI uses it from the next email." };
}

export async function deleteArticleAction(id: string): Promise<void> {
  await requireSupport();
  await db.kbArticle.delete({ where: { id } });
  revalidatePath("/support/knowledge");
}

// ---------------------------------------------------------------------------
// Settings (owner and admins)
// ---------------------------------------------------------------------------

export async function saveSupportSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireEditor();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").replace(/\s+/g, "");
  const autoReply = formData.get("autoReply") === "on";
  const signature = String(formData.get("signature") ?? "").trim();
  if (!z.string().email().safeParse(email).success) return { error: "Enter the support Gmail address" };

  const current = await db.settings.findUnique({ where: { id: "default" }, select: { supportEmail: true, supportAppPassword: true } });
  if (!password && !current?.supportAppPassword) return { error: "Paste the 16-letter app password from Google" };
  if (password && !/^[a-z]{16}$/i.test(password)) {
    return { error: "A Google app password is 16 letters (spaces don't matter). Your normal Gmail password won't work here." };
  }
  if (password || email !== current?.supportEmail) {
    const check = await testMailbox({ email, password: password || decrypt(current?.supportAppPassword) || "", ...mailServers() });
    if (!check.ok) return { error: check.error };
  }
  await db.settings.update({
    where: { id: "default" },
    data: {
      supportEmail: email,
      ...(password ? { supportAppPassword: encrypt(password) } : {}),
      // A different mailbox starts fresh from its last 14 days.
      ...(email !== current?.supportEmail ? { supportUidValidity: null, supportLastUid: null } : {}),
      supportAutoReply: autoReply,
      supportSignature: signature || null,
    },
  });
  revalidatePath("/", "layout");
  return { success: "Connected. New emails are checked every few minutes." };
}

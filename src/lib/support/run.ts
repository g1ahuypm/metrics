import "server-only";
import { db } from "../db";
import { getSettingsRow } from "../integrations/config";
import { decide, type Article, type SupportDecision } from "./ai";
import { DEFAULT_SIGNATURE, ensureKnowledgeBase } from "./knowledge";
import { fetchNewMail, getMailConfig, sendMail, type IncomingMail, type MailConfig } from "./mail";
import { findOrders, orderNumbersIn } from "./orders";

const SENDER_NAME = "LearnWell Customer Care";
/** Safety limits on replies the AI sends by itself. */
const AI_REPLIES_PER_DAY = 150;
const AI_REPLIES_PER_THREAD_PER_DAY = 2; // stops reply loops with other auto-responders

export type SupportRunResult = { fetched: number; handled: number; autoSent: number; forTeam: number; notCustomers: number; message: string };

// ---------------------------------------------------------------------------
// Storing incoming mail
// ---------------------------------------------------------------------------

async function storeIncoming(mail: IncomingMail): Promise<void> {
  if (await db.supportMessage.findUnique({ where: { messageId: mail.messageId }, select: { id: true } })) return;

  // Same conversation: Gmail's thread id, else the message it replies to.
  let thread = mail.gmailThreadId ? await db.supportThread.findUnique({ where: { key: `gm:${mail.gmailThreadId}` } }) : null;
  if (!thread) {
    const parents = [mail.inReplyTo, ...mail.references].filter((x): x is string => Boolean(x));
    if (parents.length) {
      const parent = await db.supportMessage.findFirst({ where: { messageId: { in: parents } }, select: { thread: true } });
      thread = parent?.thread ?? null;
    }
  }
  const knownCustomer = await db.supportThread.count({ where: { customerEmail: mail.fromEmail, category: "customer" } });
  const skipAi = mail.automated && !knownCustomer;

  if (!thread) {
    thread = await db.supportThread.create({
      data: {
        key: mail.gmailThreadId ? `gm:${mail.gmailThreadId}` : `msg:${mail.messageId}`,
        subject: mail.subject,
        customerEmail: mail.fromEmail,
        customerName: mail.fromName,
        category: skipAi ? "other" : "pending",
        status: skipAi ? "done" : "new",
        summary: skipAi ? "Newsletter or automated email" : null,
        lastMessageAt: mail.sentAt,
      },
    });
  } else {
    const reopen = thread.category !== "other";
    await db.supportThread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: mail.sentAt > thread.lastMessageAt ? mail.sentAt : thread.lastMessageAt,
        unread: true,
        ...(reopen ? { status: "new", draft: null, holdReason: null } : {}),
      },
    });
  }
  await db.supportMessage.create({
    data: {
      threadId: thread.id,
      messageId: mail.messageId,
      references: [...mail.references, mail.inReplyTo].filter(Boolean).join(" ") || null,
      direction: "in",
      fromEmail: mail.fromEmail,
      fromName: mail.fromName,
      toEmail: mail.toEmail,
      subject: mail.subject,
      text: mail.text,
      sentAt: mail.sentAt,
      // Newsletters and automated notifications never go to the AI.
      processedAt: skipAi ? new Date() : null,
    },
  });
}

// ---------------------------------------------------------------------------
// Deciding and replying
// ---------------------------------------------------------------------------

async function loadArticles() {
  return db.kbArticle.findMany({ orderBy: { sortOrder: "asc" } });
}

/** Asks the AI about a thread's latest customer message. Shared by the automatic run and "Draft with AI". */
export async function decideThread(threadId: string, articles?: Awaited<ReturnType<typeof loadArticles>>) {
  const [thread, settings] = await Promise.all([
    // Arrival order, not the Date header: a customer's clock can be behind ours.
    db.supportThread.findUniqueOrThrow({ where: { id: threadId }, include: { messages: { orderBy: [{ createdAt: "asc" }, { sentAt: "asc" }] } } }),
    getSettingsRow(),
  ]);
  const kb = articles ?? (await loadArticles());
  const recent = thread.messages.slice(-12);
  const latestIn = [...thread.messages].reverse().find((m) => m.direction === "in");
  const customerText = thread.messages.filter((m) => m.direction === "in").map((m) => `${m.subject}\n${m.text}`).join("\n");
  const { orders, unmatched } = await findOrders(thread.customerEmail, customerText);
  const result = await decide({
    store: settings.storeName || "LearnWell Co",
    articles: kb.map((a): Article => ({ key: a.key, title: a.title, whenToUse: a.whenToUse, answer: a.answer })),
    customerEmail: thread.customerEmail,
    customerName: thread.customerName,
    subject: thread.subject,
    thread: recent.map((m) => ({ direction: m.direction as "in" | "out", from: m.fromEmail, sentAt: m.sentAt, text: m.text, latest: m.id === latestIn?.id })),
    orders,
    unmatchedOrders: unmatched,
    today: new Date().toISOString().slice(0, 10),
  });
  return { thread, settings, kb, orders, result };
}

export function withSignature(reply: string, signature: string | null): string {
  return `${reply.trim()}\n\n${(signature || DEFAULT_SIGNATURE).trim()}`;
}

/** Why the AI's reply waits for a person instead of going out, or null when it may be sent. */
function holdReason(d: SupportDecision, article: { autoSend: boolean } | undefined, autoReply: boolean): string | null {
  if (d.needsPerson) return d.needsPersonReason || "Needs a person to read it first";
  if (!autoReply) return "Automatic replies are turned off";
  if (!article) return "No knowledge-base answer fits this email yet";
  if (!article.autoSend) return "This topic is always answered by a person";
  if (d.confidence !== "high") return "The AI was not sure enough to send on its own";
  if (d.reply.trim().length < 40) return "The AI's reply was too short to send";
  return null;
}

async function aiRepliesSince(since: Date, threadId?: string) {
  return db.supportMessage.count({ where: { direction: "out", sentBy: "AI", sentAt: { gte: since }, ...(threadId ? { threadId } : {}) } });
}

/** Sends a reply in a thread and records it. Used by the AI and by the team. */
export async function sendThreadReply(cfg: MailConfig, threadId: string, text: string, sentBy: string) {
  const thread = await db.supportThread.findUniqueOrThrow({ where: { id: threadId }, include: { messages: { orderBy: [{ createdAt: "asc" }, { sentAt: "asc" }] } } });
  const lastIn = [...thread.messages].reverse().find((m) => m.direction === "in");
  const references = thread.messages.map((m) => m.messageId).slice(-10);
  const { messageId } = await sendMail(cfg, SENDER_NAME, {
    to: thread.customerEmail,
    subject: lastIn?.subject ?? thread.subject,
    text,
    inReplyTo: lastIn?.messageId ?? null,
    references,
  });
  await db.supportMessage.create({
    data: {
      threadId,
      messageId,
      references: references.join(" "),
      direction: "out",
      fromEmail: cfg.email,
      fromName: SENDER_NAME,
      toEmail: thread.customerEmail,
      subject: /^re:/i.test(lastIn?.subject ?? "") ? lastIn!.subject : `Re: ${lastIn?.subject ?? thread.subject}`,
      text,
      sentAt: new Date(),
      sentBy,
    },
  });
}

type Outcome = "sent" | "team" | "other" | "retry";

async function handleThread(cfg: MailConfig, threadId: string, articles: Awaited<ReturnType<typeof loadArticles>>): Promise<Outcome> {
  // Claim the thread's unhandled messages so a parallel run can't answer them too.
  const claimedAt = new Date();
  const claim = await db.supportMessage.updateMany({ where: { threadId, direction: "in", processedAt: null }, data: { processedAt: claimedAt } });
  if (claim.count === 0) return "other";

  const { thread, settings, kb, orders, result } = await decideThread(threadId, articles);
  const orderNames = orders.map((o) => o.name).join(", ") || null;

  if (!result.ok) {
    if (result.retry) {
      await db.supportMessage.updateMany({ where: { threadId, processedAt: claimedAt }, data: { processedAt: null } });
      return "retry";
    }
    await db.supportThread.update({
      where: { id: threadId },
      data: { category: thread.category === "pending" ? "customer" : thread.category, status: "needs_reply", holdReason: result.error, orderNames },
    });
    return "team";
  }

  const d = result.decision;
  if (d.category === "not_customer") {
    await db.supportThread.update({
      where: { id: threadId },
      data: { category: "other", status: "done", summary: d.summary, holdReason: d.notCustomerKind.replace("_", " "), draft: null },
    });
    return "other";
  }

  const article = kb.find((a) => a.key === d.topic);
  const text = d.reply.trim() ? withSignature(d.reply, settings.supportSignature) : null;
  const actionNote = d.teamAction.trim() || (article?.flagForTeam ? d.summary : "") || null;
  let reason = holdReason(d, article, settings.supportAutoReply);
  // Hard rule: a reply never goes out on its own if it names an order that isn't this customer's.
  const own = new Set(orders.map((o) => o.name.replace("#", "").toUpperCase()));
  const foreign = orderNumbersIn(d.reply).filter((n) => !own.has(n));
  if (!reason && foreign.length) reason = `The reply mentions ${foreign.map((n) => `#${n}`).join(", ")}, which is not this customer's order`;
  if (!reason) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if ((await aiRepliesSince(dayAgo, threadId)) >= AI_REPLIES_PER_THREAD_PER_DAY) reason = "Already answered twice today; a person should take over";
    else if ((await aiRepliesSince(dayAgo)) >= AI_REPLIES_PER_DAY) reason = "Daily limit of automatic replies reached";
  }

  const base = { category: "customer", topic: article?.key ?? null, summary: d.summary, orderNames, actionNote };
  if (!reason && text) {
    try {
      await sendThreadReply(cfg, threadId, text, "AI");
      await db.supportThread.update({
        where: { id: threadId },
        data: { ...base, status: actionNote ? "needs_action" : "auto_replied", draft: null, holdReason: null },
      });
      return "sent";
    } catch (err) {
      reason = `Sending failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300);
    }
  }
  await db.supportThread.update({ where: { id: threadId }, data: { ...base, status: "needs_reply", draft: text, holdReason: reason } });
  return "team";
}

// ---------------------------------------------------------------------------
// One run: fetch, sort, answer
// ---------------------------------------------------------------------------

/**
 * Checks the support inbox once. Only one run at a time (a lock in Settings),
 * and it stops starting new AI work after `budgetMs` so it ends inside the
 * hosting time limit; whatever is left is picked up by the next run.
 */
export async function runSupport(opts: { budgetMs?: number } = {}): Promise<SupportRunResult> {
  const started = Date.now();
  // New AI work only starts in this window; each call is capped at 40s, so a run ends inside 60s.
  const budget = opts.budgetMs ?? 12_000;
  const cfg = await getMailConfig();
  if (!cfg) throw new Error("The support mailbox is not connected. Add the Gmail address and app password in Settings.");

  const now = new Date();
  const lock = await db.settings.updateMany({
    where: { id: "default", OR: [{ supportLockUntil: null }, { supportLockUntil: { lt: now } }] },
    data: { supportLockUntil: new Date(now.getTime() + 5 * 60 * 1000) },
  });
  if (lock.count === 0) return { fetched: 0, handled: 0, autoSent: 0, forTeam: 0, notCustomers: 0, message: "A check is already running" };

  const log = await db.syncLog.create({ data: { source: "support", status: "running" } });
  const out: SupportRunResult = { fetched: 0, handled: 0, autoSent: 0, forTeam: 0, notCustomers: 0, message: "" };
  try {
    await ensureKnowledgeBase();
    // A run cut off by the hosting time limit leaves claimed but unanswered emails: release them.
    await db.supportMessage.updateMany({
      where: { direction: "in", processedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) }, thread: { status: "new", category: { not: "other" } } },
      data: { processedAt: null },
    });
    const s = await getSettingsRow();
    const { mail, uidValidity, lastUid } = await fetchNewMail(cfg, { uidValidity: s.supportUidValidity, lastUid: s.supportLastUid });
    for (const m of mail.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())) await storeIncoming(m);
    out.fetched = mail.length;
    await db.settings.update({ where: { id: "default" }, data: { supportUidValidity: uidValidity, supportLastUid: lastUid, lastSupportSyncAt: new Date() } });

    const articles = await loadArticles();
    const pending = await db.supportMessage.findMany({
      where: { direction: "in", processedAt: null },
      orderBy: { sentAt: "asc" },
      select: { threadId: true },
    });
    const threadIds = [...new Set(pending.map((p) => p.threadId))];
    for (let i = 0; i < threadIds.length; i += 3) {
      if (Date.now() - started > budget) break;
      const results = await Promise.all(threadIds.slice(i, i + 3).map((id) => handleThread(cfg, id, articles)));
      for (const r of results) {
        if (r === "retry") continue;
        out.handled++;
        if (r === "sent") out.autoSent++;
        else if (r === "team") out.forTeam++;
        else out.notCustomers++;
      }
      if (results.includes("retry")) break; // the AI is rate limited or down: try again next run
    }
    const left = threadIds.length - out.handled;
    out.message = `${out.fetched} new email${out.fetched === 1 ? "" : "s"}; ${out.autoSent} answered by AI, ${out.forTeam} for the team, ${out.notCustomers} not customers${left > 0 ? `; ${left} waiting for the next check` : ""}`;
    await db.syncLog.update({ where: { id: log.id }, data: { status: "success", message: out.message, records: out.fetched, finishedAt: new Date() } });
    return out;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.syncLog.update({ where: { id: log.id }, data: { status: "error", message, finishedAt: new Date() } });
    throw err;
  } finally {
    await db.settings.update({ where: { id: "default" }, data: { supportLockUntil: null } });
  }
}

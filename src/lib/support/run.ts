import "server-only";
import { db } from "../db";
import { decide, type Article, type SupportDecision } from "./ai";
import { defaultSignature, ensureKnowledgeBase } from "./knowledge";
import { fetchNewMail, getMailConfig, sendMail, type IncomingMail, type MailConfig } from "./mail";
import { findOrders, orderNumbersIn } from "./orders";

const senderName = (store: { name: string }) => `${store.name} Customer Care`;
// The AI never sends anything. It writes a draft for every customer email; a person on the team
// checks it and clicks Send. A draft is marked ready when nothing needs deciding, otherwise it says why.
export type SupportRunResult = { fetched: number; handled: number; ready: number; needDecision: number; notCustomers: number; message: string };

// ---------------------------------------------------------------------------
// Storing incoming mail
// ---------------------------------------------------------------------------

async function storeIncoming(storeId: string, mail: IncomingMail, history: boolean): Promise<void> {
  if (await db.supportMessage.findUnique({ where: { storeId_messageId: { storeId, messageId: mail.messageId } }, select: { id: true } })) return;

  // Same conversation: Gmail's thread id, else the message it replies to.
  let thread = mail.gmailThreadId ? await db.supportThread.findUnique({ where: { storeId_key: { storeId, key: `gm:${mail.gmailThreadId}` } } }) : null;
  if (!thread) {
    const parents = [mail.inReplyTo, ...mail.references].filter((x): x is string => Boolean(x));
    if (parents.length) {
      const parent = await db.supportMessage.findFirst({ where: { storeId, messageId: { in: parents } }, select: { thread: true } });
      thread = parent?.thread ?? null;
    }
  }
  const knownCustomer = await db.supportThread.count({ where: { storeId, customerEmail: mail.fromEmail, category: "customer" } });
  const skipAi = mail.automated && !knownCustomer;

  if (!thread) {
    thread = await db.supportThread.create({
      data: {
        storeId,
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
        // A new customer message restarts the "opened but not answered" clock.
        ...(reopen ? { status: "new", draft: null, holdReason: null, openedAt: null, openedById: null } : {}),
      },
    });
  }
  await db.supportMessage.create({
    data: {
      threadId: thread.id,
      storeId,
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
      history,
    },
  });
}

// ---------------------------------------------------------------------------
// Deciding and replying
// ---------------------------------------------------------------------------

async function loadArticles(storeId: string) {
  return db.kbArticle.findMany({ where: { storeId }, orderBy: { sortOrder: "asc" } });
}

/** Asks the AI about a thread's latest customer message. Shared by the automatic run and "Draft with AI". */
export async function decideThread(threadId: string, articles?: Awaited<ReturnType<typeof loadArticles>>) {
  // Arrival order, not the Date header: a customer's clock can be behind ours.
  const thread = await db.supportThread.findUniqueOrThrow({
    where: { id: threadId },
    include: { store: true, messages: { orderBy: [{ createdAt: "asc" }, { sentAt: "asc" }] } },
  });
  const settings = thread.store!;
  const kb = articles ?? (await loadArticles(settings.id));
  const recent = thread.messages.slice(-12);
  const latestIn = [...thread.messages].reverse().find((m) => m.direction === "in");
  const customerText = thread.messages.filter((m) => m.direction === "in").map((m) => `${m.subject}\n${m.text}`).join("\n");
  const { orders, unmatched } = await findOrders(settings.id, thread.customerEmail, customerText);
  const result = await decide({
    store: settings.name,
    about: settings.supportAbout,
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

export function withSignature(reply: string, store: { name: string; supportSignature: string | null }): string {
  return `${reply.trim()}\n\n${(store.supportSignature || defaultSignature(store.name)).trim()}`;
}

/** What a person must decide before sending the AI's draft, or null when the draft only needs a check. */
export function decisionNeeded(d: SupportDecision, article: { autoSend: boolean } | undefined): string | null {
  if (d.needsPerson) return d.needsPersonReason || "A person needs to decide how to answer";
  if (!article) return "No knowledge-base topic covers this email yet";
  if (!article.autoSend) return "This topic always needs a person to check the facts";
  if (d.confidence !== "high") return "The AI was not sure its answer is complete";
  if (d.reply.trim().length < 40) return "The AI's draft is very short";
  return null;
}

/** Sends a reply in a thread and records it. Used by the AI and by the team. */
export async function sendThreadReply(cfg: MailConfig, threadId: string, text: string, sentBy: string) {
  const thread = await db.supportThread.findUniqueOrThrow({
    where: { id: threadId },
    include: { store: { select: { name: true } }, messages: { orderBy: [{ createdAt: "asc" }, { sentAt: "asc" }] } },
  });
  const lastIn = [...thread.messages].reverse().find((m) => m.direction === "in");
  const references = thread.messages.map((m) => m.messageId).slice(-10);
  const sender = senderName(thread.store ?? { name: "Customer Care" });
  const { messageId } = await sendMail(cfg, sender, {
    to: thread.customerEmail,
    subject: lastIn?.subject ?? thread.subject,
    text,
    inReplyTo: lastIn?.messageId ?? null,
    references,
  });
  await db.supportMessage.create({
    data: {
      threadId,
      storeId: thread.storeId,
      messageId,
      references: references.join(" "),
      direction: "out",
      fromEmail: cfg.email,
      fromName: sender,
      toEmail: thread.customerEmail,
      subject: /^re:/i.test(lastIn?.subject ?? "") ? lastIn!.subject : `Re: ${lastIn?.subject ?? thread.subject}`,
      text,
      sentAt: new Date(),
      sentBy,
    },
  });
}

type Outcome = "ready" | "decide" | "other" | "retry";

async function handleThread(threadId: string, articles: Awaited<ReturnType<typeof loadArticles>>): Promise<Outcome> {
  // Claim the thread's unhandled messages so a parallel run can't answer them too.
  const claimedAt = new Date();
  const claim = await db.supportMessage.updateMany({ where: { threadId, direction: "in", processedAt: null }, data: { processedAt: claimedAt } });
  if (claim.count === 0) return "other";
  const onlyHistory = (await db.supportMessage.count({ where: { threadId, processedAt: claimedAt, history: false } })) === 0;

  const { thread, settings, kb, orders, result } = await decideThread(threadId, articles);
  const orderNames = orders.map((o) => o.name).join(", ") || null;

  if (!result.ok) {
    const tries = await db.supportMessage.aggregate({ where: { threadId, processedAt: claimedAt }, _max: { aiAttempts: true } });
    if (result.retry && (tries._max.aiAttempts ?? 0) < 2) {
      await db.supportMessage.updateMany({ where: { threadId, processedAt: claimedAt }, data: { processedAt: null, aiAttempts: { increment: 1 } } });
      return "retry";
    }
    await db.supportThread.update({
      where: { id: threadId },
      data: { category: thread.category === "pending" ? "customer" : thread.category, status: "needs_reply", holdReason: result.error, orderNames },
    });
    return "decide";
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
  const text = d.reply.trim() ? withSignature(d.reply, settings) : null;
  const actionNote = d.teamAction.trim() || (article?.flagForTeam ? d.summary : "") || null;
  let reason = onlyHistory ? "Arrived before Support was connected. Check it wasn't already answered in Gmail" : decisionNeeded(d, article);
  // A draft that names an order that isn't this customer's always needs a person.
  const own = new Set(orders.map((o) => o.name.replace("#", "").toUpperCase()));
  const foreign = orderNumbersIn(d.reply).filter((n) => !own.has(n));
  if (!reason && foreign.length) reason = `The draft mentions ${foreign.map((n) => `#${n}`).join(", ")}, which is not this customer's order`;
  if (!text) reason ??= "The AI wrote no reply";

  // A clearly upset customer goes straight onto the team's To do list, marked urgent (reminders until
  // answered). Not for mail from before Support was connected: it may already be answered in Gmail.
  const upset = d.upset && !onlyHistory ? { urgent: true, ...(thread.todoAt ? {} : { todoAt: new Date(), todoAuto: true }) } : {};
  await db.supportThread.update({
    where: { id: threadId },
    data: { category: "customer", topic: article?.key ?? null, summary: d.summary, orderNames, actionNote, status: "needs_reply", draft: text, holdReason: reason, ...upset },
  });
  return reason ? "decide" : "ready";
}

// ---------------------------------------------------------------------------
// One run: fetch, sort, answer
// ---------------------------------------------------------------------------

/**
 * Checks one store's support inbox once. Only one run per store at a time (a lock on the store),
 * and it stops starting new AI work after `budgetMs` so it ends inside the
 * hosting time limit; whatever is left is picked up by the next run.
 */
export async function runSupport(storeId: string, opts: { budgetMs?: number } = {}): Promise<SupportRunResult> {
  const started = Date.now();
  // New AI work only starts in this window; each call is capped at 40s, so a run ends inside 60s.
  const budget = opts.budgetMs ?? 12_000;
  const cfg = await getMailConfig(storeId);
  if (!cfg) throw new Error("The support mailbox is not connected. Add the Gmail address and app password in Settings.");

  const now = new Date();
  const lock = await db.store.updateMany({
    where: { id: storeId, OR: [{ supportLockUntil: null }, { supportLockUntil: { lt: now } }] },
    data: { supportLockUntil: new Date(now.getTime() + 5 * 60 * 1000) },
  });
  if (lock.count === 0) return { fetched: 0, handled: 0, ready: 0, needDecision: 0, notCustomers: 0, message: "A check is already running" };

  const log = await db.syncLog.create({ data: { source: "support", status: "running", storeId } });
  const out: SupportRunResult = { fetched: 0, handled: 0, ready: 0, needDecision: 0, notCustomers: 0, message: "" };
  try {
    await ensureKnowledgeBase(storeId);
    // A run cut off by the hosting time limit leaves claimed but unanswered emails: release them.
    await db.supportMessage.updateMany({
      where: { storeId, direction: "in", processedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) }, thread: { status: "new", category: { not: "other" } } },
      data: { processedAt: null },
    });
    const s = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    const { mail, uidValidity, lastUid, firstScan } = await fetchNewMail(cfg, { uidValidity: s.supportUidValidity, lastUid: s.supportLastUid });
    // The first scan brings in the last 14 days, which may already have been answered in Gmail.
    for (const m of mail.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())) await storeIncoming(storeId, m, firstScan);
    out.fetched = mail.length;
    await db.store.update({ where: { id: storeId }, data: { supportUidValidity: uidValidity, supportLastUid: lastUid, lastSupportSyncAt: new Date() } });

    const articles = await loadArticles(storeId);
    const pending = await db.supportMessage.findMany({
      where: { storeId, direction: "in", processedAt: null },
      orderBy: { sentAt: "asc" },
      select: { threadId: true },
    });
    const threadIds = [...new Set(pending.map((p) => p.threadId))];
    for (let i = 0; i < threadIds.length; i += 3) {
      if (Date.now() - started > budget) break;
      const results = await Promise.all(threadIds.slice(i, i + 3).map((id) => handleThread(id, articles)));
      for (const r of results) {
        if (r === "retry") continue;
        out.handled++;
        if (r === "ready") out.ready++;
        else if (r === "decide") out.needDecision++;
        else out.notCustomers++;
      }
      if (results.includes("retry")) break; // the AI is rate limited or down: try again next run
    }
    const left = threadIds.length - out.handled;
    out.message = `${out.fetched} new email${out.fetched === 1 ? "" : "s"}; ${out.ready} drafts ready to send, ${out.needDecision} needing a decision, ${out.notCustomers} not customers${left > 0 ? `; ${left} waiting for the next check` : ""}`;
    await db.syncLog.update({ where: { id: log.id }, data: { status: "success", message: out.message, records: out.fetched, finishedAt: new Date() } });
    return out;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.syncLog.update({ where: { id: log.id }, data: { status: "error", message, finishedAt: new Date() } });
    throw err;
  } finally {
    await db.store.update({ where: { id: storeId }, data: { supportLockUntil: null } });
  }
}

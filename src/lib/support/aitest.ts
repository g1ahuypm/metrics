import "server-only";
import { db } from "../db";
import { decide, type Instructions, type SupportDecision } from "./ai";
import { ensureKnowledgeBase } from "./knowledge";
import { decisionNeeded, withSignature } from "./run";
import type { FixtureMessage } from "./fixtures";
import type { SupportOrder } from "./orders";

// Runs one email through the support AI exactly as the inbox would, without storing or sending anything.

export type TestCase = {
  customerName: string | null;
  customerEmail: string;
  subject: string;
  thread: FixtureMessage[];
  orders: SupportOrder[];
  unmatched: string[];
  today: string;
};

export type TestOutcome =
  | {
      ok: true;
      decision: SupportDecision;
      /** null = "Draft ready"; otherwise what a person must decide before sending. */
      decisionNeeded: string | null;
      topicTitle: string | null;
      draft: string;
      seconds: number;
    }
  | { ok: false; error: string };

export async function runTest(storeId: string, tc: TestCase, instructions: Instructions): Promise<TestOutcome> {
  await ensureKnowledgeBase(storeId);
  const [store, articles] = await Promise.all([
    db.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true, supportAbout: true, supportEmail: true, supportSignature: true } }),
    db.kbArticle.findMany({ where: { storeId }, orderBy: { sortOrder: "asc" } }),
  ]);
  const recent = tc.thread.slice(-12);
  const latestIn = recent.map((m) => m.direction).lastIndexOf("in");
  const started = Date.now();
  const result = await decide({
    store: store.name,
    about: store.supportAbout,
    articles: articles.map((a) => ({ key: a.key, title: a.title, whenToUse: a.whenToUse, answer: a.answer })),
    customerEmail: tc.customerEmail,
    customerName: tc.customerName,
    subject: tc.subject,
    thread: recent.map((m, i) => ({
      direction: m.direction,
      from: m.direction === "in" ? tc.customerEmail : store.supportEmail ?? "us",
      sentAt: new Date(m.sentAt),
      text: m.text,
      latest: i === latestIn,
    })),
    orders: tc.orders,
    unmatchedOrders: tc.unmatched,
    today: tc.today,
    instructions,
  });
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  if (!result.ok) return { ok: false, error: result.error };
  const d = result.decision;
  const article = articles.find((a) => a.key === d.topic);
  return {
    ok: true,
    decision: d,
    decisionNeeded: d.category === "not_customer" ? "Sorted as not a customer" : decisionNeeded(d, article),
    topicTitle: article?.title ?? null,
    draft: d.reply.trim() ? withSignature(d.reply, store) : "",
    seconds,
  };
}

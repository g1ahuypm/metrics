import { requireSupport } from "@/lib/auth";
import { db } from "@/lib/db";
import { validTimezone } from "@/lib/scope";
import { getStoreScope } from "@/lib/stores";
import { ensureKnowledgeBase } from "@/lib/support/knowledge";
import { SupportHeader } from "@/components/support/SupportHeader";
import { KnowledgeEditor } from "./KnowledgeEditor";

export default async function KnowledgePage() {
  const user = await requireSupport();
  const scope = await getStoreScope(user);
  const store = scope.store;
  const tz = validTimezone(user.timeZone ?? scope.timezone);
  // Each store has its own knowledge base: one store has to be picked.
  if (!store) {
    return (
      <div>
        <SupportHeader active="knowledge" mailbox={null} lastCheck={null} timeZone={tz} />
        <div className="card px-4 py-10 text-center text-sm text-ink-2">Each store has its own knowledge base. Pick a store above to see and edit it.</div>
      </div>
    );
  }
  await ensureKnowledgeBase(store.id);
  const articles = await db.kbArticle.findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" } });
  const connected = Boolean(store.supportEmail && store.supportAppPassword);
  return (
    <div>
      <SupportHeader active="knowledge" mailbox={connected ? store.supportEmail : null} lastCheck={store.lastSupportSyncAt} timeZone={tz} />
      <p className="mb-4 max-w-3xl text-sm text-ink-2">
        The AI answers {store.name}&apos;s customers only with what is written here and with their real Shopify order. Each topic says which questions it
        covers and what the answer is. Turn off <strong className="font-medium text-ink">Send on its own</strong> for topics a person should always answer.
      </p>
      <KnowledgeEditor
        storeId={store.id}
        articles={articles.map((a) => ({ id: a.id, title: a.title, whenToUse: a.whenToUse, answer: a.answer, autoSend: a.autoSend, flagForTeam: a.flagForTeam }))}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { canEdit, requireSupport } from "@/lib/auth";
import { validTimezone } from "@/lib/scope";
import { getStoreScope } from "@/lib/stores";
import { db } from "@/lib/db";
import { ensureKnowledgeBase } from "@/lib/support/knowledge";
import { FIXTURES } from "@/lib/support/fixtures";
import { SupportHeader } from "@/components/support/SupportHeader";
import { AiTestBench } from "./AiTestBench";

export const maxDuration = 60;

export default async function TestAiPage() {
  const user = await requireSupport();
  if (!canEdit(user.role)) redirect("/support");
  const scope = await getStoreScope(user);
  const tz = validTimezone(user.timeZone ?? scope.timezone);
  const store = scope.store;
  if (!store) {
    return (
      <div>
        <SupportHeader showTest active="test" mailbox={null} lastCheck={null} timeZone={tz} />
        <div className="card px-4 py-10 text-center text-sm text-ink-2">Each store has its own knowledge base. Pick a store above to test its AI.</div>
      </div>
    );
  }
  await ensureKnowledgeBase(store.id);
  const keys = (await db.kbArticle.findMany({ where: { storeId: store.id }, select: { key: true } })).map((a) => a.key);
  const connected = Boolean(store.supportEmail && store.supportAppPassword);
  return (
    <div>
      <SupportHeader showTest active="test" mailbox={connected ? store.supportEmail : null} lastCheck={store.lastSupportSyncAt} timeZone={tz} />
      <p className="mb-4 max-w-3xl text-sm text-ink-2">
        Try the AI on any email and see the draft it would write for {store.name}, using this store&apos;s knowledge base. Nothing is saved or sent. Each
        run uses the AI once or twice (a few cents).
      </p>
      <AiTestBench storeId={store.id} kbKeys={keys} fixtures={FIXTURES} />
    </div>
  );
}

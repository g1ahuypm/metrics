import { requireSupport } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettingsRow } from "@/lib/integrations/config";
import { validTimezone } from "@/lib/scope";
import { ensureKnowledgeBase } from "@/lib/support/knowledge";
import { SupportHeader } from "@/components/support/SupportHeader";
import { KnowledgeEditor } from "./KnowledgeEditor";

export default async function KnowledgePage() {
  await requireSupport();
  await ensureKnowledgeBase();
  const [settings, articles] = await Promise.all([getSettingsRow(), db.kbArticle.findMany({ orderBy: { sortOrder: "asc" } })]);
  const connected = Boolean(settings.supportEmail && settings.supportAppPassword);
  return (
    <div>
      <SupportHeader active="knowledge" mailbox={connected ? settings.supportEmail : null} lastCheck={settings.lastSupportSyncAt} timeZone={validTimezone(settings.timezone)} />
      <p className="mb-4 max-w-3xl text-sm text-ink-2">
        The AI answers customers only with what is written here and with their real Shopify order. Each topic says which questions it covers and what the
        answer is. Turn off <strong className="font-medium text-ink">Send on its own</strong> for topics a person should always answer.
      </p>
      <KnowledgeEditor
        articles={articles.map((a) => ({ id: a.id, title: a.title, whenToUse: a.whenToUse, answer: a.answer, autoSend: a.autoSend, flagForTeam: a.flagForTeam }))}
      />
    </div>
  );
}

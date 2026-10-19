import { canSupport, requireSignedIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettingsRow } from "@/lib/integrations/config";
import { AppShell } from "@/components/AppShell";
import { maybeAutoSync, maybeRemindTasks } from "@/lib/autosync";

export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSignedIn();
  const [settings, supportCount, inboxCount, overdueCount] = await Promise.all([
    getSettingsRow(),
    canSupport(user.role) ? db.supportThread.count({ where: { category: { not: "other" }, status: { in: ["needs_reply", "needs_action"] } } }) : 0,
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.task.count({ where: { assigneeId: user.id, status: "open", dueAt: { lte: new Date() } } }),
  ]);
  if (user.role !== "SUPPORT") await maybeAutoSync();
  await maybeRemindTasks();
  return (
    <AppShell user={user} storeName={settings.storeName} supportCount={supportCount} inboxCount={inboxCount} overdueCount={overdueCount}>
      {children}
    </AppShell>
  );
}

import { canSupport, requireSignedIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStoreScope } from "@/lib/stores";
import { AppShell } from "@/components/AppShell";
import { maybeAutoSync, maybeRemindTasks } from "@/lib/autosync";

export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSignedIn();
  const scope = await getStoreScope(user);
  const [supportCount, inboxCount, overdueCount] = await Promise.all([
    canSupport(user.role)
      ? db.supportThread.count({ where: { storeId: { in: scope.storeIds }, category: { not: "other" }, status: { in: ["needs_reply", "needs_action"] } } })
      : 0,
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.task.count({ where: { assigneeId: user.id, status: "open", dueAt: { lte: new Date() } } }),
  ]);
  if (user.role !== "SUPPORT") await maybeAutoSync();
  await maybeRemindTasks();
  return (
    <AppShell
      user={user}
      storeName={scope.store?.name ?? "All stores"}
      stores={scope.stores.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
      currentStore={scope.store?.id ?? null}
      supportCount={supportCount}
      inboxCount={inboxCount}
      overdueCount={overdueCount}
    >
      {children}
    </AppShell>
  );
}

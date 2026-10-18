import { canSupport, requireSignedIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettingsRow } from "@/lib/integrations/config";
import { AppShell } from "@/components/AppShell";
import { maybeAutoSync } from "@/lib/autosync";

export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSignedIn();
  const [settings, supportCount] = await Promise.all([
    getSettingsRow(),
    canSupport(user.role) ? db.supportThread.count({ where: { category: { not: "other" }, status: { in: ["needs_reply", "needs_action"] } } }) : 0,
  ]);
  if (user.role !== "SUPPORT") await maybeAutoSync();
  return (
    <AppShell user={user} storeName={settings.storeName} supportCount={supportCount}>
      {children}
    </AppShell>
  );
}

import { requireUser } from "@/lib/auth";
import { getSettingsRow } from "@/lib/integrations/config";
import { AppShell } from "@/components/AppShell";
import { maybeAutoSync } from "@/lib/autosync";

export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettingsRow();
  await maybeAutoSync();
  return (
    <AppShell user={user} storeName={settings.storeName}>
      {children}
    </AppShell>
  );
}

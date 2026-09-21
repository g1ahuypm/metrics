import { requireUser } from "@/lib/auth";
import { getSettingsRow } from "@/lib/integrations/config";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettingsRow();
  return (
    <AppShell user={user} storeName={settings.storeName}>
      {children}
    </AppShell>
  );
}

import { requireUser } from "@/lib/auth";
import { getSettingsRow } from "@/lib/integrations/config";
import { AppShell } from "@/components/AppShell";
import { maybeAutoSync } from "@/lib/autosync";
import { getProductOptions } from "@/lib/metrics";
import { getScope } from "@/lib/scope";

export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [settings, products, scope] = await Promise.all([getSettingsRow(), getProductOptions(), getScope()]);
  await maybeAutoSync();
  const productId = scope.productId && products.some((p) => p.id === scope.productId) ? scope.productId : "";
  return (
    <AppShell user={user} storeName={settings.storeName} products={products} productId={productId}>
      {children}
    </AppShell>
  );
}

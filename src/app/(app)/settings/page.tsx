import { requireEditor } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettingsRow } from "@/lib/integrations/config";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { GeneralSettingsForm, IntegrationCard, PasswordForm } from "./SettingsClient";
import { decrypt, mask } from "@/lib/crypto";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  await requireEditor();
  const sp = await searchParams;
  const [settings, logs] = await Promise.all([
    getSettingsRow(),
    db.syncLog.findMany({ orderBy: { startedAt: "desc" }, take: 12 }),
  ]);

  const shopifyToken = decrypt(settings.shopifyToken) || process.env.SHOPIFY_ACCESS_TOKEN || "";
  const metaToken = decrypt(settings.metaToken) || process.env.META_ACCESS_TOKEN || "";
  const shopifyDomain = settings.shopifyDomain || process.env.SHOPIFY_STORE_DOMAIN || "";
  const metaAccount = settings.metaAdAccountId || process.env.META_AD_ACCOUNT_ID || "";

  return (
    <div>
      <PageHeader title="Settings" description="Store details, integrations and sync." />

      {sp.welcome && (
        <div className="alert-success mb-6">
          Your account is ready. Connect Shopify and Meta below, then run a sync. You can also invite partners from the Team page.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <IntegrationCard
          source="shopify"
          title="Shopify"
          description="Orders, refunds, products and cost per item from the Admin API."
          connected={Boolean(shopifyDomain && shopifyToken)}
          identity={shopifyDomain}
          tokenHint={mask(shopifyToken)}
          lastSync={fmtDateTime(settings.lastShopifySyncAt)}
          fields={[
            { name: "domain", label: "Store domain", placeholder: "my-store.myshopify.com", defaultValue: shopifyDomain },
            { name: "token", label: "Admin API access token", placeholder: "shpat_…", type: "password" },
          ]}
          help={[
            "Shopify admin → Settings → Apps and sales channels → Develop apps → Create an app.",
            "Configure Admin API access scopes: read_orders, read_all_orders (history beyond 60 days), read_products, read_inventory (cost per item), read_customers (new vs returning). Read-only is enough.",
            "Install the app and copy the Admin API access token. Set 'Cost per item' on products so COGS syncs automatically.",
          ]}
        />
        <IntegrationCard
          source="meta"
          title="Meta Ads"
          description="Daily spend, impressions, clicks and attributed purchases per campaign."
          connected={Boolean(metaAccount && metaToken)}
          identity={metaAccount}
          tokenHint={mask(metaToken)}
          lastSync={fmtDateTime(settings.lastMetaSyncAt)}
          fields={[
            { name: "adAccountId", label: "Ad account ID", placeholder: "act_123456789", defaultValue: metaAccount },
            { name: "token", label: "Access token", placeholder: "EAAB…", type: "password" },
          ]}
          help={[
            "Meta Business Settings → Users → System users → Add a system user with access to the ad account.",
            "Generate a token with the ads_read permission (system-user tokens do not expire).",
            "Find the ad account ID in Ads Manager (the number after act= in the URL).",
          ]}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="text-sm font-semibold">Store</h2>
          <div className="mt-3">
            <GeneralSettingsForm settings={{ storeName: settings.storeName, currency: settings.currency, timezone: settings.timezone }} />
          </div>
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-semibold">Automatic sync</h2>
          <p className="mt-1 text-xs text-ink-2">
            Syncs run when you click the buttons above. To keep data fresh automatically, call the endpoint below every hour
            from Vercel Cron (already configured in <code>vercel.json</code>), a server cron, or any uptime service.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">
{`curl -H "Authorization: Bearer $CRON_SECRET" \\
  https://your-domain/api/cron/sync`}
          </pre>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-3">Recent syncs</h3>
          <ul className="mt-2 divide-y divide-border text-xs">
            {logs.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-1.5">
                <div>
                  <span className={`font-medium ${l.status === "error" ? "text-bad-text" : l.status === "success" ? "text-good-text" : "text-ink-2"}`}>
                    {l.source} · {l.status}
                  </span>
                  {l.message && <div className="text-ink-2">{l.message}</div>}
                </div>
                <span className="whitespace-nowrap text-ink-3">{fmtDateTime(l.startedAt)}</span>
              </li>
            ))}
            {logs.length === 0 && <li className="py-1.5 text-ink-3">No syncs yet</li>}
          </ul>
        </div>
      </div>

      <div className="mt-6 card p-4 lg:w-1/2">
        <h2 className="text-sm font-semibold">Change your password</h2>
        <div className="mt-3">
          <PasswordForm />
        </div>
      </div>
    </div>
  );
}

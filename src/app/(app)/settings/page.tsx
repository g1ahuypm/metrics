import { requireEditor } from "@/lib/auth";
import { db } from "@/lib/db";
import { getIntegrationConfig, getSettingsRow } from "@/lib/integrations/config";
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

  const cfg = await getIntegrationConfig();
  const metaToken = decrypt(settings.metaToken) || process.env.META_ACCESS_TOKEN || "";
  const shopifyDomain = settings.shopifyDomain || process.env.SHOPIFY_STORE_DOMAIN || "";
  const shopifyClientId = settings.shopifyClientId || process.env.SHOPIFY_CLIENT_ID || "";
  const shopifySecretHint =
    cfg.shopify?.kind === "client" ? mask(cfg.shopify.clientSecret) : cfg.shopify?.kind === "static" ? mask(cfg.shopify.token) : "";
  const metaAccount = settings.metaAdAccountId || process.env.META_AD_ACCOUNT_ID || "";

  return (
    <div>
      <PageHeader title="Settings" description="Store details, integrations and sync." />

      {sp.welcome && (
        <div className="alert-success mb-6">
          Your account is ready. Connect Shopify and Meta below, then run a sync. You can also invite partners from the Team page.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IntegrationCard
          source="shopify"
          title="Shopify"
          description="Orders, refunds, products and cost per item from the Admin API."
          connected={Boolean(cfg.shopify)}
          identity={`${shopifyDomain}${shopifyClientId ? ` · client ${shopifyClientId.slice(0, 8)}…` : ""}`}
          tokenHint={shopifySecretHint}
          lastSync={fmtDateTime(settings.lastShopifySyncAt)}
          fields={[
            { name: "domain", label: "Store domain", placeholder: "my-store.myshopify.com", defaultValue: shopifyDomain },
            { name: "clientId", label: "Client ID", placeholder: "from Dev Dashboard → App settings", defaultValue: shopifyClientId },
            { name: "clientSecret", label: "Client secret", placeholder: "shpss_…", type: "password" },
            { name: "token", label: "Legacy Admin API access token (only for apps created before 2026)", placeholder: "shpat_… (leave empty for Dev Dashboard apps)", type: "password", optional: true },
          ]}
          help={[
            "Go to dev.shopify.com → Apps → Create app → Start from Dev Dashboard. Name it anything.",
            "Open Versions → New version. Under Scopes tick read_orders, read_products, read_inventory and read_customers, then Release.",
            "On the Overview page click Install app (Installs card), pick your store and confirm. The app must be installed for the connection to work.",
            "App settings → Credentials: copy the Client ID and Client secret into the fields here. Tokens are fetched automatically and renewed every 24 hours.",
            "App settings → Protected customer data access: choose a reason such as Analytics and save, so orders can be matched to customers (new vs returning). Without it, everything else still syncs.",
            "Shopify lets apps read the last 60 days of orders. The first sync imports those; later syncs keep adding new orders.",
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

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card min-w-0 p-4">
          <h2 className="text-sm font-semibold">Store</h2>
          <div className="mt-3">
            <GeneralSettingsForm settings={{ storeName: settings.storeName, currency: settings.currency, timezone: settings.timezone }} />
          </div>
        </div>
        <div className="card min-w-0 p-4">
          <h2 className="text-sm font-semibold">Automatic sync</h2>
          <p className="mt-1 text-xs text-ink-2">
            Data refreshes by itself: whenever someone opens the dashboard and the last sync is over an hour old, a sync runs in
            the background, and a scheduled sync runs daily. The buttons above sync right now. The endpoint below is for your own
            scheduler if you want more frequent syncs.
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

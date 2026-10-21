import { CheckCircle2, XCircle } from "lucide-react";
import { requireEditor } from "@/lib/auth";
import { db } from "@/lib/db";
import { storeConfig } from "@/lib/integrations/config";
import { fmtDateTime } from "@/lib/format";
import { mask } from "@/lib/crypto";
import { getStoreScope, STORE_COLORS } from "@/lib/stores";
import { validTimezone } from "@/lib/scope";
import { connectShopifyAction, disconnectShopifyAction, updateStoreDetailsAction } from "@/lib/actions/settings";
import { saveSupportSettingsAction } from "@/lib/actions/support";
import { DEFAULT_SIGNATURE, defaultSignature } from "@/lib/support/knowledge";
import { PageHeader } from "@/components/PageHeader";
import { SupportSettingsCard } from "@/components/support/SupportSettingsCard";
import { AdAccountsCard, AddStoreForm, IntegrationCard, PasswordForm, StoreDetailsForm } from "./SettingsClient";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const me = await requireEditor();
  const sp = await searchParams;
  const scope = await getStoreScope(me);
  const tz = validTimezone(me.timeZone ?? scope.timezone);
  const store = scope.store;
  const visible = scope.stores.map((s) => s.id);
  const [logs, accounts] = await Promise.all([
    db.syncLog.findMany({ orderBy: { startedAt: "desc" }, take: 12 }),
    db.adAccount.findMany({
      where: me.role === "OWNER" ? {} : { stores: { some: { storeId: { in: visible } } } },
      orderBy: { createdAt: "asc" },
      include: {
        stores: { select: { storeId: true } },
        _count: { select: { campaigns: true } },
        campaigns: { where: { storeId: null }, select: { id: true } },
      },
    }),
  ]);
  const cfg = store ? storeConfig(store) : null;
  const switcherStores = scope.stores.map((s) => ({ id: s.id, name: s.name, color: s.color }));
  const firstStore = store && scope.stores[0]?.id === store.id;

  return (
    <div>
      <PageHeader title="Settings" description="Stores, their connections, and sync." />

      {sp.welcome && (
        <div className="alert-success mb-6">
          Your account is ready. Connect Shopify and Meta below, then run a sync. You can also invite partners from the Team page.
        </div>
      )}

      <div className="card mb-6 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Stores</h2>
            <p className="mt-0.5 text-xs text-ink-2">Each store has its own Shopify, support inbox and costs. Switch between them at the top of any page.</p>
          </div>
          {me.role === "OWNER" && <AddStoreForm />}
        </div>
        <ul className="mt-4 divide-y divide-border">
          {scope.stores.map((s) => {
            const shopify = Boolean(s.shopifyDomain && (s.shopifyClientSecret || s.shopifyToken));
            const support = Boolean(s.supportEmail && s.supportAppPassword);
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                <span className="flex min-w-0 flex-1 items-center gap-2 font-semibold">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                  <span className="truncate">{s.name}</span>
                  {store?.id === s.id && <span className="badge">Showing below</span>}
                </span>
                <span className={`inline-flex items-center gap-1 text-xs ${shopify ? "text-good-text" : "text-ink-3"}`}>
                  {shopify ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} Shopify{shopify ? ` · ${s.shopifyDomain}` : ""}
                </span>
                <span className={`inline-flex items-center gap-1 text-xs ${support ? "text-good-text" : "text-ink-3"}`}>
                  {support ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} Support inbox
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {store && cfg ? (
        <>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <span className="h-3 w-3 rounded-full" style={{ background: store.color }} aria-hidden="true" />
            {store.name}
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Keyed by store: switching stores must start every form fresh, never keep the last store's values. */}
            <IntegrationCard
              key={`shopify-${store.id}`}
              title="Shopify"
              description="Orders, refunds, products and cost per item from the Admin API."
              connect={connectShopifyAction.bind(null, store.id)}
              disconnect={disconnectShopifyAction.bind(null, store.id)}
              syncTarget={{ source: "shopify", storeId: store.id }}
              connected={Boolean(cfg.shopify)}
              identity={`${store.shopifyDomain ?? ""}${store.shopifyClientId ? ` · client ${store.shopifyClientId.slice(0, 8)}…` : ""}`}
              tokenHint={cfg.shopify?.kind === "client" ? mask(cfg.shopify.clientSecret) : cfg.shopify?.kind === "static" ? mask(cfg.shopify.token) : ""}
              lastSync={fmtDateTime(store.lastShopifySyncAt, tz)}
              fields={[
                { name: "domain", label: "Store domain", placeholder: "my-store.myshopify.com", defaultValue: store.shopifyDomain ?? "" },
                { name: "clientId", label: "Client ID", placeholder: "from Dev Dashboard → App settings", defaultValue: store.shopifyClientId ?? "" },
                { name: "clientSecret", label: "Client secret", placeholder: "shpss_…", type: "password" },
                { name: "token", label: "Legacy Admin API access token (only for apps created before 2026)", placeholder: "shpat_… (leave empty for Dev Dashboard apps)", type: "password", optional: true },
              ]}
              help={[
                "Go to dev.shopify.com → Apps → Create app → Start from Dev Dashboard. Name it anything (one app per store).",
                "Open Versions → New version. Under Scopes tick read_orders, read_products, read_inventory and read_customers, then Release.",
                "On the Overview page click Install app (Installs card), pick this store and confirm. The app must be installed for the connection to work.",
                "App settings → Credentials: copy the Client ID and Client secret into the fields here. Tokens are fetched automatically and renewed every 24 hours.",
                "App settings → Protected customer data access: choose a reason such as Analytics and save, so orders can be matched to customers (new vs returning). Without it, everything else still syncs.",
                "Shopify lets apps read the last 60 days of orders. The first sync imports those; later syncs keep adding new orders.",
              ]}
            />
            <div className="card min-w-0 p-4">
              <h2 className="text-sm font-bold">Store details</h2>
              <div className="mt-3">
                <StoreDetailsForm
                  key={store.id}
                  save={updateStoreDetailsAction.bind(null, store.id)}
                  store={{ name: store.name, color: store.color, currency: store.currency, timezone: store.timezone }}
                  colors={STORE_COLORS}
                />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <SupportSettingsCard
              key={store.id}
              save={saveSupportSettingsAction.bind(null, store.id)}
              storeName={store.name}
              about={store.supportAbout}
              email={store.supportEmail}
              connected={Boolean(store.supportEmail && store.supportAppPassword)}
              autoReply={store.supportAutoReply}
              signature={store.supportSignature}
              defaultSignature={firstStore ? DEFAULT_SIGNATURE : defaultSignature(store.name)}
              aiReady={Boolean(process.env.ANTHROPIC_API_KEY)}
              lastCheck={fmtDateTime(store.lastSupportSyncAt, tz)}
            />
          </div>
        </>
      ) : (
        <div className="card px-4 py-8 text-center text-sm text-ink-2">Pick a store at the top of the page to see its Shopify, support inbox and details.</div>
      )}

      <div className="mt-6">
        <AdAccountsCard
          stores={switcherStores}
          accounts={accounts.map((a) => ({
            id: a.id,
            metaAccountId: a.metaAccountId,
            name: a.name,
            connected: Boolean(a.token),
            tokenHint: a.token ? "••••" : "",
            lastSync: fmtDateTime(a.lastSyncAt, tz),
            storeIds: a.stores.map((s) => s.storeId),
            campaigns: a._count.campaigns,
            unlinked: a.campaigns.length,
          }))}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card min-w-0 p-4">
          <h2 className="text-sm font-bold">Automatic sync</h2>
          <p className="mt-1 text-xs text-ink-2">
            Data refreshes by itself: whenever someone opens the dashboard and the last sync is over an hour old, every store and ad account syncs in the
            background, and a scheduled sync runs daily. The buttons above sync right now.
          </p>
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
                <span className="whitespace-nowrap text-ink-3">{fmtDateTime(l.startedAt, tz)}</span>
              </li>
            ))}
            {logs.length === 0 && <li className="py-1.5 text-ink-3">No syncs yet</li>}
          </ul>
        </div>
        <div className="card min-w-0 p-4">
          <h2 className="text-sm font-bold">Change your password</h2>
          <div className="mt-3">
            <PasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}

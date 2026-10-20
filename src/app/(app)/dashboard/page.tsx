import Link from "next/link";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { hourIn, scopeQuery } from "@/lib/dates";
import { getScope, validTimezone } from "@/lib/scope";
import { getDataStatus, getMetrics } from "@/lib/metrics";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ProfitOverview } from "@/components/ProfitOverview";
import { DataBanner } from "@/components/DataBanner";
import { EmptyState } from "@/components/EmptyState";
import { StoreBreakdown } from "@/components/StoreBreakdown";

type Search = { range?: string; from?: string; to?: string; denied?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const scope = await getScope(user, sp);
  const { range } = scope;
  const [report, status] = await Promise.all([getMetrics(range, scope), getDataStatus(scope)]);
  const currency = status.currency;
  const hasData = status.orderCount > 0 || status.insightCount > 0;
  const hour = hourIn(new Date(), validTimezone(user.timeZone ?? range.tz));
  const who = scope.stores.store ? scope.stores.store.name : scope.stores.stores.length > 1 ? "your stores" : "your store";
  const greeting = `Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${user.name.trim().split(/\s+/)[0]}`;

  return (
    <div>
      <PageHeader title={greeting} description={`Here's how ${who} did · ${range.label}`}>
        <DateRangePicker range={range} />
        <Link href={`/api/export/daily?${scopeQuery(range)}${scope.stores.store ? `&store=${scope.stores.store.id}` : ""}`} className="btn-ghost" prefetch={false} title="Download day-by-day numbers as CSV">
          <Download className="h-4 w-4" />
        </Link>
      </PageHeader>

      {sp.denied && <div className="alert-error mb-4">You need owner or admin access for that page.</div>}
      <DataBanner shopifyConnected={status.shopifyConnected} metaConnected={status.metaConnected} hasData={hasData} role={user.role} />

      {!hasData ? (
        <EmptyState title="No data yet" description="Connect Shopify and Meta Ads in Settings and run a sync." actionHref="/settings" actionLabel="Go to settings" />
      ) : (
        <>
          <ProfitOverview report={report} currency={currency} adNote={status.metaConnected ? "No ad spend" : "Meta not connected"} />
          <StoreBreakdown stores={report.byStore} unlinkedSpend={report.unlinkedSpend} currency={currency} />
        </>
      )}
    </div>
  );
}

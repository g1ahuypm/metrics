import Link from "next/link";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { scopeQuery } from "@/lib/dates";
import { getScope } from "@/lib/scope";
import { getDataStatus, getMetrics } from "@/lib/metrics";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ProfitOverview } from "@/components/ProfitOverview";
import { DataBanner } from "@/components/DataBanner";
import { EmptyState } from "@/components/EmptyState";

type Search = { range?: string; from?: string; to?: string; denied?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { range } = await getScope(sp);
  const [report, status] = await Promise.all([getMetrics(range), getDataStatus()]);
  const currency = status.settings?.currency ?? "USD";
  const hasData = status.orderCount > 0 || status.insightCount > 0;

  return (
    <div>
      <PageHeader title="Dashboard" description={`Whole store · ${range.label}`}>
        <DateRangePicker range={range} />
        <Link href={`/api/export/daily?${scopeQuery(range)}`} className="btn-ghost" prefetch={false} title="Download day-by-day numbers as CSV">
          <Download className="h-4 w-4" />
        </Link>
      </PageHeader>

      {sp.denied && <div className="alert-error mb-4">You need owner or admin access for that page.</div>}
      <DataBanner shopifyConnected={status.shopifyConnected} metaConnected={status.metaConnected} hasData={hasData} role={user.role} />

      {!hasData ? (
        <EmptyState title="No data yet" description="Connect Shopify and Meta Ads in Settings and run a sync." actionHref="/settings" actionLabel="Go to settings" />
      ) : (
        <ProfitOverview report={report} currency={currency} adNote={status.metaConnected ? "No ad spend" : "Meta not connected"} />
      )}
    </div>
  );
}

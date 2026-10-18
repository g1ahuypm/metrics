import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { canEdit } from "@/lib/auth-shared";

/** Says plainly what is not connected yet and what that means for the numbers. */
export function DataBanner({
  shopifyConnected,
  metaConnected,
  hasData,
  role,
}: {
  shopifyConnected: boolean;
  metaConnected: boolean;
  hasData: boolean;
  role: string;
}) {
  if (shopifyConnected && metaConnected) return null;
  const message = !shopifyConnected
    ? hasData
      ? "Shopify is not connected. These are demo numbers."
      : "Connect Shopify to see your real numbers."
    : "Meta Ads is not connected, so ad spend shows $0 and profit is before ads.";
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-text" />
        <span className="text-ink-2">{message}</span>
      </div>
      {canEdit(role) && (
        <Link href="/settings" className="btn-secondary py-1.5 text-xs">
          Open settings
        </Link>
      )}
    </div>
  );
}

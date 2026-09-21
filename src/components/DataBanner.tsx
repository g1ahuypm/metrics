import Link from "next/link";
import { AlertTriangle, Sparkles } from "lucide-react";
import { canEdit } from "@/lib/auth-shared";

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
  const missing = [!shopifyConnected && "Shopify", !metaConnected && "Meta Ads"].filter(Boolean).join(" and ");
  return (
    <div className="mb-6 flex flex-col gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        {hasData ? <Sparkles className="mt-0.5 h-4 w-4 text-warn-text" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-warn-text" />}
        <div>
          <span className="font-medium text-warn-text">{missing} not connected.</span>{" "}
          <span className="text-ink-2">
            {hasData ? "You are looking at demo data." : "Connect your accounts to start seeing real numbers."}
          </span>
        </div>
      </div>
      {canEdit(role) && (
        <Link href="/settings" className="btn-secondary py-1.5 text-xs">
          Open settings
        </Link>
      )}
    </div>
  );
}

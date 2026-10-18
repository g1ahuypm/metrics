import Link from "next/link";
import { Megaphone } from "lucide-react";
import type { ProductOption } from "@/lib/metrics";

/** Banner shown when a single product is selected. */
export function ProductScope({ product, query, page }: { product: ProductOption | undefined; query: string; page: "dashboard" | "profit" | "sales" | "ads" }) {
  if (!product) return null;
  const campaigns = product.campaigns;
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <span className="font-semibold">Showing only {product.title}.</span>{" "}
        <span className="text-ink-2">
          {page === "ads"
            ? campaigns > 0
              ? `Ad spend from the ${campaigns} linked campaign${campaigns === 1 ? "" : "s"}.`
              : "No campaigns are linked to this product yet, so ad spend shows as zero."
            : campaigns > 0
              ? `Sales from orders containing it; ad spend from its ${campaigns} linked campaign${campaigns === 1 ? "" : "s"}; order-level costs and shared expenses split by its share.`
              : "No campaigns are linked to this product yet, so ad spend shows as zero. Link them on the Meta Ads page."}
        </span>
      </div>
      {campaigns === 0 && page !== "ads" && (
        <Link href={`/ads?${query}`} className="btn-secondary py-1.5 text-xs">
          <Megaphone className="h-3.5 w-3.5" /> Link campaigns
        </Link>
      )}
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Package } from "lucide-react";
import { setProductScopeAction } from "@/lib/actions/scope";

export type ProductOption = { id: string; title: string; units: number; campaigns: number };

/** Global product selector: the choice is remembered and applies to every page. */
export function ProductPicker({ products, value }: { products: ProductOption[]; value: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        <Package className="h-3.5 w-3.5" /> Viewing
        {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      </span>
      <select
        className={`input py-1.5 text-sm ${value ? "border-accent font-medium" : ""}`}
        value={value}
        aria-label="Product"
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            await setProductScopeAction(id || null);
            // Drop any product in the URL so the saved choice is what every page uses.
            const url = new URL(window.location.href);
            url.searchParams.delete("product");
            router.replace(url.pathname + url.search);
            router.refresh();
          });
        }}
      >
        <option value="">All products</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
    </label>
  );
}

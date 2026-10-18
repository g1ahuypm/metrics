"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Package } from "lucide-react";

export type ProductOption = { id: string; title: string; units: number };

export function ProductPicker({ products, value }: { products: ProductOption[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  function pick(id: string) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("product", id);
    else next.delete("product");
    start(() => router.push(`${pathname}?${next.toString()}`));
  }

  return (
    <div className="flex items-center gap-2">
      <Package className="h-4 w-4 text-ink-3" />
      <select className="input w-auto max-w-[260px] py-1.5 text-sm" value={value} onChange={(e) => pick(e.target.value)} aria-label="Product">
        <option value="">All products</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-ink-3" />}
    </div>
  );
}

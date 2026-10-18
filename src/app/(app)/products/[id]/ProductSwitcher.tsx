"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { productHref } from "@/lib/links";

/** Jump straight to another product's page. */
export function ProductSwitcher({ products, value }: { products: { id: string; title: string }[]; value: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <select
        className="input w-auto max-w-[260px] py-1.5 text-sm"
        value={value}
        aria-label="Switch product"
        onChange={(e) => start(() => router.push(productHref(e.target.value)))}
      >
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

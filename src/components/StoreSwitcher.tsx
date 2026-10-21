"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStoreAction } from "@/lib/actions/stores";

export type SwitcherStore = { id: string; name: string; color: string };

/** Store pills: every store this person may see, plus All stores for the owner. Shown only with two or more. */
export function StoreSwitcher({ stores, current, allowAll }: { stores: SwitcherStore[]; current: string | null; allowAll: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useOptimistic(current ?? (allowAll ? "all" : stores[0]?.id ?? ""));
  if (stores.length < 2) return null;
  const pick = (id: string) =>
    start(async () => {
      setSelected(id);
      await setStoreAction(id);
      router.refresh();
    });
  const pill = (id: string, label: string, color?: string) => {
    const active = selected === id;
    return (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => pick(id)}
        className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm transition-colors ${
          active ? "bg-ink font-bold text-surface" : "font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink"
        }`}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color ?? (active ? "var(--surface)" : "var(--ink)") }} aria-hidden="true" />
        {label}
      </button>
    );
  };
  return (
    <div className="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-busy={pending}>
      <div role="tablist" aria-label="Store" className="inline-flex gap-1 rounded-full border border-border bg-surface p-1">
        {allowAll && pill("all", "All stores")}
        {stores.map((s) => pill(s.id, s.name, s.color))}
      </div>
    </div>
  );
}

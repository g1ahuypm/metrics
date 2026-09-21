"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Loader2 } from "lucide-react";
import { PRESETS, toISODate, type DateRange } from "@/lib/dates";

export function DateRangePicker({ range }: { range: DateRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [showCustom, setShowCustom] = useState(range.preset === "custom");
  const [from, setFrom] = useState(toISODate(range.from));
  const [to, setTo] = useState(toISODate(range.to));

  function go(next: URLSearchParams) {
    start(() => router.push(`${pathname}?${next.toString()}`));
  }

  function pick(key: string) {
    const next = new URLSearchParams(params.toString());
    next.delete("from");
    next.delete("to");
    next.set("range", key);
    setShowCustom(false);
    go(next);
  }

  function applyCustom() {
    if (!from || !to || from > to) return;
    const next = new URLSearchParams(params.toString());
    next.delete("range");
    next.set("from", from);
    next.set("to", to);
    go(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="hidden md:flex items-center rounded-lg border border-border bg-surface p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => pick(p.key)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              range.preset === p.key ? "bg-accent-soft text-accent" : "text-ink-2 hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
            range.preset === "custom" ? "bg-accent-soft text-accent" : "text-ink-2 hover:text-ink"
          }`}
        >
          Custom
        </button>
      </div>
      <select
        className="input md:hidden w-auto"
        value={range.preset}
        onChange={(e) => (e.target.value === "custom" ? setShowCustom(true) : pick(e.target.value))}
      >
        {PRESETS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
      {showCustom && (
        <div className="flex items-center gap-1.5">
          <input type="date" className="input w-auto py-1.5 text-xs" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-xs text-ink-3">to</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          <button type="button" className="btn-secondary py-1.5 text-xs" onClick={applyCustom}>
            <CalendarDays className="h-3.5 w-3.5" /> Apply
          </button>
        </div>
      )}
      {pending && <Loader2 className="h-4 w-4 animate-spin text-ink-3" />}
    </div>
  );
}

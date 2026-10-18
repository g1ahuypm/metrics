"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { setCampaignProductAction } from "@/lib/actions/campaigns";
import { fmtMoney, fmtMultiple, fmtNumber } from "@/lib/format";
import type { CampaignSummary } from "@/lib/metrics";

/**
 * The one place to say "these campaigns sell this product". Ticking a campaign
 * links it here (moving it from another product if needed); its spend then counts
 * toward this product on every page.
 */
export function CampaignPicker({
  productId,
  campaigns,
  productTitles,
  currency,
  editor,
}: {
  productId: string;
  campaigns: CampaignSummary[];
  productTitles: Record<string, string>;
  currency: string;
  editor: boolean;
}) {
  const [linked, setLinked] = useState(() => new Map(campaigns.map((c) => [c.id, c.productId])));
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => Number(linked.get(b.id) === productId) - Number(linked.get(a.id) === productId) || b.spend - a.spend || a.name.localeCompare(b.name));
  }, [campaigns, linked, productId, query]);

  const mine = campaigns.filter((c) => linked.get(c.id) === productId);
  const total = mine.reduce((s, c) => ({ spend: s.spend + c.spend, purchases: s.purchases + c.purchases, value: s.value + c.purchaseValue }), { spend: 0, purchases: 0, value: 0 });

  function toggle(id: string, on: boolean) {
    const next = on ? productId : null;
    setLinked((m) => new Map(m).set(id, next));
    setBusy(id);
    start(async () => {
      await setCampaignProductAction(id, next);
      setBusy(null);
    });
  }

  return (
    <div>
      {campaigns.length > 8 && (
        <div className="relative mb-2 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-3" />
          <input className="input pl-8" placeholder="Search campaigns" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      <div className="max-h-[420px] overflow-auto">
        <table className="table">
          <thead className="sticky top-0 bg-surface">
            <tr>
              <th className="w-8"></th>
              <th>Campaign</th>
              <th className="text-right">Spend</th>
              <th className="text-right">Meta purchases</th>
              <th className="text-right">Meta ROAS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const owner = linked.get(c.id);
              const on = owner === productId;
              return (
                <tr key={c.id} className={on ? "bg-accent-soft/40" : ""}>
                  <td>
                    {busy === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-ink-3" />
                    ) : (
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--accent)]"
                        checked={on}
                        disabled={!editor}
                        onChange={(e) => toggle(c.id, e.target.checked)}
                        aria-label={`${c.name} sells this product`}
                      />
                    )}
                  </td>
                  <td>
                    <label className="block max-w-[360px] cursor-pointer truncate font-medium" title={c.name} onClick={() => editor && busy !== c.id && toggle(c.id, !on)}>
                      {c.name}
                    </label>
                    <div className="text-[11px] text-ink-3">
                      {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                      {owner && owner !== productId && <span className="text-warn-text"> · now counted for {productTitles[owner] ?? "another product"}</span>}
                    </div>
                  </td>
                  <td className="text-right tnum">{fmtMoney(c.spend, currency)}</td>
                  <td className="text-right tnum text-ink-2">{fmtNumber(c.purchases)}</td>
                  <td className="text-right tnum text-ink-2">{c.spend > 0 ? fmtMultiple(c.roas) : "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-ink-3">
                  No campaigns match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-2">
        {mine.length === 0
          ? "No campaigns ticked yet, so this product shows $0 ad spend."
          : `${mine.length} campaign${mine.length === 1 ? "" : "s"} ticked · ${fmtMoney(total.spend, currency)} spend in this period · Meta reports ${fmtNumber(total.purchases)} purchases (${total.spend > 0 ? fmtMultiple(total.value / total.spend) : "—"} ROAS).`}
      </p>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { autoMatchCampaignsAction, setCampaignProductAction } from "@/lib/actions/campaigns";

type Option = { id: string; title: string };

export function CampaignProductSelect({ campaignId, productId, products }: { campaignId: string; productId: string | null; products: Option[] }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(productId ?? "");
  return (
    <div className="flex items-center gap-1.5">
      <select
        className={`input w-auto max-w-[220px] py-1 text-xs ${value ? "" : "text-ink-3"}`}
        value={value}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          start(() => setCampaignProductAction(campaignId, v || null));
        }}
      >
        <option value="">Not linked</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-3" />}
    </div>
  );
}

export function AutoMatchButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-ink-3">{msg}</span>}
      <button
        type="button"
        className="btn-secondary py-1.5 text-xs"
        disabled={pending}
        title="Link unlinked campaigns whose name mentions a product"
        onClick={() =>
          start(async () => {
            const r = await autoMatchCampaignsAction();
            setMsg(r.matched ? `Linked ${r.matched} campaign${r.matched === 1 ? "" : "s"} by name` : "No campaign names matched a product");
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
        Auto-link by name
      </button>
    </div>
  );
}

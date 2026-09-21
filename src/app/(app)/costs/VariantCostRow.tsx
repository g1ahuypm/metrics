"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { recalculateCogsAction, updateVariantCostAction } from "@/lib/actions/costs";
import { fmtMoney, fmtPercent, safeDiv } from "@/lib/format";

type Variant = {
  id: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  price: number;
  unitCost: number | null;
  costSource: string;
};

export function VariantCostRow({ variant, currency, readOnly }: { variant: Variant; currency: string; readOnly: boolean }) {
  const [value, setValue] = useState(variant.unitCost === null ? "" : String(variant.unitCost));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const dirty = value !== (variant.unitCost === null ? "" : String(variant.unitCost));
  const cost = value === "" ? null : Number(value);
  const margin = cost === null ? null : safeDiv(variant.price - cost, variant.price);
  const title =
    variant.variantTitle && variant.variantTitle !== "Default Title"
      ? `${variant.productTitle} – ${variant.variantTitle}`
      : variant.productTitle;

  function save() {
    start(async () => {
      await updateVariantCostAction(variant.id, cost);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <tr>
      <td className="font-medium">{title}</td>
      <td className="text-ink-2">{variant.sku ?? "—"}</td>
      <td className="text-right tnum">{fmtMoney(variant.price, currency, { decimals: 2 })}</td>
      <td className="text-right">
        {readOnly ? (
          <span className="tnum">{cost === null ? "—" : fmtMoney(cost, currency, { decimals: 2 })}</span>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <input
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && dirty && save()}
              className="input w-28 py-1 text-right tnum"
              placeholder="0.00"
            />
            {dirty ? (
              <button type="button" className="btn-secondary px-2 py-1" onClick={save} disabled={pending} aria-label="Save cost">
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
            ) : saved ? (
              <Check className="h-3.5 w-3.5 text-good-text" />
            ) : variant.costSource === "manual" ? (
              <button
                type="button"
                className="btn-ghost px-2 py-1"
                title="Reset to Shopify cost"
                onClick={() => start(async () => { await updateVariantCostAction(variant.id, null); setValue(""); })}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="w-[30px]" />
            )}
          </div>
        )}
      </td>
      <td className={`text-right tnum ${margin !== null && margin < 0.2 ? "text-warn-text" : ""}`}>
        {margin === null ? "—" : fmtPercent(margin, 0)}
      </td>
      <td>
        <span className="badge">{variant.costSource === "manual" ? "Manual" : variant.unitCost === null ? "Missing" : "Shopify"}</span>
      </td>
    </tr>
  );
}

export function RecalculateButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {result && <span className="text-xs text-ink-3">{result}</span>}
      <button
        type="button"
        className="btn-secondary py-1.5 text-xs"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await recalculateCogsAction();
            setResult(`Recalculated ${r.orders} orders`);
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Apply costs to past orders
      </button>
    </div>
  );
}

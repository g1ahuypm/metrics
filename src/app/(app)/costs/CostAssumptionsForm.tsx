"use client";

import { useActionState } from "react";
import { updateCostAssumptionsAction } from "@/lib/actions/settings";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";

type Settings = {
  paymentFeePercent: number;
  paymentFeeFixed: number;
  platformFeePercent: number;
  defaultShippingCost: number;
  defaultHandlingCost: number;
  defaultCogsPercent: number;
};

export function CostAssumptionsForm({ settings, currency, readOnly }: { settings: Settings; currency: string; readOnly: boolean }) {
  const [state, action] = useActionState(updateCostAssumptionsAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Payment fee %</label>
          <input name="paymentFeePercent" type="number" step="0.01" min="0" defaultValue={settings.paymentFeePercent} className="input" readOnly={readOnly} />
        </div>
        <div>
          <label className="label">Fixed fee / order ({currency})</label>
          <input name="paymentFeeFixed" type="number" step="0.01" min="0" defaultValue={settings.paymentFeeFixed} className="input" readOnly={readOnly} />
        </div>
        <div>
          <label className="label">Shopify platform fee %</label>
          <input name="platformFeePercent" type="number" step="0.01" min="0" max="100" defaultValue={settings.platformFeePercent} className="input" readOnly={readOnly} />
          <p className="mt-1 text-[11px] text-ink-3">0 on Shopify Payments; 0.5–2% with a third-party gateway.</p>
        </div>
        <div>
          <label className="label">Fallback COGS % of price</label>
          <input name="defaultCogsPercent" type="number" step="0.1" min="0" max="100" defaultValue={settings.defaultCogsPercent} className="input" readOnly={readOnly} />
          <p className="mt-1 text-[11px] text-ink-3">Used only for variants with no unit cost.</p>
        </div>
        <div>
          <label className="label">Shipping cost / order ({currency})</label>
          <input name="defaultShippingCost" type="number" step="0.01" min="0" defaultValue={settings.defaultShippingCost} className="input" readOnly={readOnly} />
        </div>
        <div>
          <label className="label">Handling cost / order ({currency})</label>
          <input name="defaultHandlingCost" type="number" step="0.01" min="0" defaultValue={settings.defaultHandlingCost} className="input" readOnly={readOnly} />
          <p className="mt-1 text-[11px] text-ink-3">Pick, pack, packaging, 3PL fees.</p>
        </div>
      </div>
      {!readOnly && <SubmitButton className="btn-secondary" pendingText="Saving…">Save assumptions</SubmitButton>}
    </form>
  );
}

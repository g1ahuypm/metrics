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

function Field({ label, name, value, hint, readOnly, step = "0.01", max }: { label: string; name: string; value: number; hint?: string; readOnly: boolean; step?: string; max?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type="number" step={step} min="0" max={max} defaultValue={value} className="input" readOnly={readOnly} />
      {hint && <p className="mt-1 text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}

export function CostAssumptionsForm({ settings, currency, readOnly }: { settings: Settings; currency: string; readOnly: boolean }) {
  const [state, action] = useActionState(updateCostAssumptionsAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Payment fees</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Processing fee %" name="paymentFeePercent" value={settings.paymentFeePercent} readOnly={readOnly} max="100" />
          <Field label={`Fixed fee per order (${currency})`} name="paymentFeeFixed" value={settings.paymentFeeFixed} readOnly={readOnly} />
        </div>
        <div className="mt-3">
          <Field label="Shopify platform fee %" name="platformFeePercent" value={settings.platformFeePercent} readOnly={readOnly} max="100" hint="0 on Shopify Payments. 0.5–2% if you use PayPal or another gateway." />
        </div>
      </div>
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Fulfillment</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Shipping per order (${currency})`} name="defaultShippingCost" value={settings.defaultShippingCost} readOnly={readOnly} hint="Only for orders whose products have no supplier shipping on the Product costs page." />
          <Field label={`Handling per order (${currency})`} name="defaultHandlingCost" value={settings.defaultHandlingCost} readOnly={readOnly} hint="Pick, pack, packaging, 3PL." />
        </div>
      </div>
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Fallback</div>
        <Field label="Product cost as % of price" name="defaultCogsPercent" value={settings.defaultCogsPercent} readOnly={readOnly} step="0.1" max="100" hint="Used only for products with no supplier cost and no Shopify cost per item." />
      </div>
      {!readOnly && <SubmitButton className="btn-secondary" pendingText="Saving…">Save assumptions</SubmitButton>}
    </form>
  );
}

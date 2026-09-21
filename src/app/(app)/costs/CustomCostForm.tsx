"use client";

import { useActionState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addCustomCostAction, deleteCustomCostAction } from "@/lib/actions/costs";
import { COST_CATEGORIES, COST_TYPE_LABELS, COST_TYPES } from "@/lib/constants";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";

export function CustomCostForm() {
  const [state, action] = useActionState(addCustomCostAction, undefined);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="rounded-lg border border-border bg-surface-2 p-3">
      <FormMessage state={state} />
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className="label">Name</label>
          <input name="name" required className="input" placeholder="Klaviyo, VA salary, agency fee…" />
        </div>
        <div>
          <label className="label">Category</label>
          <select name="category" className="input">
            {COST_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Type</label>
          <select name="type" className="input" defaultValue="MONTHLY">
            {COST_TYPES.map((t) => (
              <option key={t} value={t}>
                {COST_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Amount</label>
          <input name="amount" type="number" step="0.01" min="0" required className="input" placeholder="0.00" />
        </div>
        <div>
          <label className="label">Start date</label>
          <input name="startDate" type="date" required defaultValue={today} className="input" />
        </div>
        <div>
          <label className="label">End date (optional)</label>
          <input name="endDate" type="date" className="input" />
        </div>
        <div className="lg:col-span-4">
          <label className="label">Notes (optional)</label>
          <input name="notes" className="input" />
        </div>
        <div className="flex items-end">
          <SubmitButton className="btn-primary w-full" pendingText="Adding…">Add cost</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function DeleteCostButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-danger py-1"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this cost?")) start(() => deleteCustomCostAction(id));
      }}
      aria-label="Delete cost"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

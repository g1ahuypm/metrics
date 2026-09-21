import { canEdit, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettingsRow } from "@/lib/integrations/config";
import { fmtDate, fmtMoney } from "@/lib/format";
import { COST_TYPE_LABELS, type CostType } from "@/lib/constants";
import { PageHeader } from "@/components/PageHeader";
import { CostAssumptionsForm } from "./CostAssumptionsForm";
import { CustomCostForm, DeleteCostButton } from "./CustomCostForm";
import { VariantCostRow, RecalculateButton } from "./VariantCostRow";

export default async function CostsPage() {
  const user = await requireUser();
  const editor = canEdit(user.role);
  const [settings, variants, customCosts] = await Promise.all([
    getSettingsRow(),
    db.productVariant.findMany({ orderBy: [{ productTitle: "asc" }, { variantTitle: "asc" }] }),
    db.customCost.findMany({ orderBy: { startDate: "desc" } }),
  ]);
  const currency = settings.currency;
  const missingCosts = variants.filter((v) => v.unitCost === null).length;

  return (
    <div>
      <PageHeader
        title="Costs & COGS"
        description="Everything that gets deducted from revenue to reach net profit."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-1">
          <h2 className="text-sm font-semibold">Cost assumptions</h2>
          <p className="mt-1 text-xs text-ink-3">
            Used when Shopify does not report an exact value. Payment fees come from Shopify Payments when available.
          </p>
          <div className="mt-4">
            <CostAssumptionsForm settings={settings} currency={currency} readOnly={!editor} />
          </div>
        </div>

        <div className="card lg:col-span-2 overflow-hidden">
          <div className="flex flex-col gap-2 px-4 pt-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Custom costs</h2>
              <p className="text-xs text-ink-3">Apps, contractors, agencies, creative, rent. Spread automatically across days.</p>
            </div>
          </div>
          {editor && (
            <div className="px-4 pb-4">
              <CustomCostForm />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th className="text-right">Amount</th>
                  <th>From</th>
                  <th>To</th>
                  {editor && <th></th>}
                </tr>
              </thead>
              <tbody>
                {customCosts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="font-medium">{c.name}</div>
                      {c.notes && <div className="text-[11px] text-ink-3">{c.notes}</div>}
                    </td>
                    <td className="text-ink-2">{c.category}</td>
                    <td className="text-ink-2">{COST_TYPE_LABELS[c.type as CostType] ?? c.type}</td>
                    <td className="text-right tnum">
                      {c.type === "PERCENT_REVENUE" ? `${c.amount}%` : fmtMoney(c.amount, currency, { decimals: 2 })}
                    </td>
                    <td className="text-ink-2 whitespace-nowrap">{fmtDate(c.startDate, { year: "numeric", month: "short", day: "numeric" })}</td>
                    <td className="text-ink-2 whitespace-nowrap">{c.endDate ? fmtDate(c.endDate, { year: "numeric", month: "short", day: "numeric" }) : "ongoing"}</td>
                    {editor && (
                      <td className="text-right">
                        <DeleteCostButton id={c.id} />
                      </td>
                    )}
                  </tr>
                ))}
                {customCosts.length === 0 && (
                  <tr>
                    <td colSpan={editor ? 7 : 6} className="text-center text-ink-3">No custom costs yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-6 card overflow-hidden">
        <div className="flex flex-col gap-2 px-4 pt-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Product costs (COGS)</h2>
            <p className="text-xs text-ink-3">
              Pulled from Shopify&apos;s &quot;Cost per item&quot;. Override any variant here; manual values survive future syncs.
              {missingCosts > 0 && <span className="text-warn-text"> {missingCosts} variant{missingCosts === 1 ? "" : "s"} have no cost yet.</span>}
            </p>
          </div>
          {editor && variants.length > 0 && <RecalculateButton />}
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="text-right">Price</th>
                <th className="text-right">Unit cost</th>
                <th className="text-right">Margin</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <VariantCostRow key={v.id} variant={v} currency={currency} readOnly={!editor} />
              ))}
              {variants.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-ink-3">No products synced yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

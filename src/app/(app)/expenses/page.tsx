import { canEdit, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettingsRow } from "@/lib/integrations/config";
import { fmtDate, fmtMoney } from "@/lib/format";
import { toISODate, todayUtc } from "@/lib/dates";
import { COST_TYPE_LABELS, type CostType } from "@/lib/constants";
import { PageHeader } from "@/components/PageHeader";
import { CostAssumptionsForm } from "./CostAssumptionsForm";
import { CustomCostForm, DeleteCostButton } from "./CustomCostForm";

export default async function ExpensesPage() {
  const user = await requireUser();
  const editor = canEdit(user.role);
  const [settings, customCosts] = await Promise.all([
    getSettingsRow(),
    db.customCost.findMany({ orderBy: [{ endDate: "asc" }, { startDate: "desc" }] }),
  ]);
  const currency = settings.currency;
  const today = new Date();
  const active = customCosts.filter((c) => !c.endDate || c.endDate >= today);
  const ended = customCosts.filter((c) => c.endDate && c.endDate < today);

  const table = (rows: typeof customCosts) => (
    <table className="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Category</th>
          <th>How it&apos;s charged</th>
          <th className="text-right">Amount</th>
          <th>From</th>
          <th>Until</th>
          {editor && <th></th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id}>
            <td>
              <div className="font-medium">{c.name}</div>
              {c.notes && <div className="text-[11px] text-ink-3">{c.notes}</div>}
            </td>
            <td className="text-ink-2">{c.category}</td>
            <td className="text-ink-2">{COST_TYPE_LABELS[c.type as CostType] ?? c.type}</td>
            <td className="text-right tnum">{c.type === "PERCENT_REVENUE" ? `${c.amount}%` : fmtMoney(c.amount, currency)}</td>
            <td className="whitespace-nowrap text-ink-2">{fmtDate(c.startDate, { year: "numeric", month: "short", day: "numeric" })}</td>
            <td className="whitespace-nowrap text-ink-2">{c.endDate ? fmtDate(c.endDate, { year: "numeric", month: "short", day: "numeric" }) : "ongoing"}</td>
            {editor && (
              <td className="text-right">
                <DeleteCostButton id={c.id} />
              </td>
            )}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={editor ? 7 : 6} className="text-center text-ink-3">Nothing here yet</td>
          </tr>
        )}
      </tbody>
    </table>
  );

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Everything you pay that is not a product or an ad: apps, contractors, agencies, fees. All of it is deducted on the Profit & Loss."
      />

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="card overflow-hidden lg:col-span-2">
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold">Recurring and one-off expenses</h2>
            <p className="text-xs text-ink-3">
              Monthly amounts are spread evenly across the days of each month, so any date range shows its fair share.
            </p>
          </div>
          {editor && (
            <div className="px-4 pb-4">
              <CustomCostForm today={toISODate(todayUtc())} />
            </div>
          )}
          <div className="overflow-x-auto">{table(active)}</div>
          {ended.length > 0 && (
            <details className="border-t border-border px-4 py-3 text-sm">
              <summary className="cursor-pointer text-ink-2">Ended expenses ({ended.length})</summary>
              <div className="-mx-4 mt-2 overflow-x-auto">{table(ended)}</div>
            </details>
          )}
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold">Per-order assumptions</h2>
          <p className="mt-1 text-xs text-ink-3">
            Applied to every order when the source data has no exact figure. Payment fees come straight from Shopify Payments
            when the order reports them.
          </p>
          <div className="mt-4">
            <CostAssumptionsForm settings={settings} currency={currency} readOnly={!editor} />
          </div>
        </div>
      </div>
    </div>
  );
}

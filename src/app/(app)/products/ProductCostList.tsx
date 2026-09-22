"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, ChevronDown, ChevronRight, Info, Loader2, Plus, RefreshCw, Search, Trash2, Undo2 } from "lucide-react";
import { clearVariantTiersAction, recostOrdersAction, saveTiersAction, type TierInput } from "@/lib/actions/costs";
import { resolveTier } from "@/lib/costing";
import { fmtMoney, fmtNumber, fmtPercent, safeDiv } from "@/lib/format";

export type TierRow = { quantity: number; productCost: number; shippingCost: number };

export type VariantCostData = {
  id: string;
  shopifyId: string;
  title: string;
  sku: string | null;
  price: number;
  shopifyUnitCost: number | null;
  unitsSold: number;
  quantitiesBought: number[];
  tiers: TierRow[];
};

export type ProductCostData = {
  productId: string;
  title: string;
  imageUrl: string | null;
  tiers: TierRow[];
  variants: VariantCostData[];
};

// ---------------------------------------------------------------------------

export function ProductCostList({ products, currency, editor }: { products: ProductCostData[]; currency: string; editor: boolean }) {
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [recosting, startRecost] = useTransition();
  const [recostMsg, setRecostMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const missing = p.tiers.length === 0 && p.variants.some((v) => v.tiers.length === 0);
      if (onlyMissing && !missing) return false;
      if (!q) return true;
      return p.title.toLowerCase().includes(q) || p.variants.some((v) => v.sku?.toLowerCase().includes(q) || v.title.toLowerCase().includes(q));
    });
  }, [products, query, onlyMissing]);

  const missingCount = products.filter((p) => p.tiers.length === 0 && p.variants.some((v) => v.tiers.length === 0)).length;

  return (
    <div>
      <div className="card mb-4 flex gap-3 p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="text-ink-2">
          <p>
            <strong className="text-ink">Qty 1</strong> is what one unit costs you, product plus shipping.{" "}
            <strong className="text-ink">Qty 2</strong> is the total for a two-unit order, and so on. When a customer buys a quantity you
            haven&apos;t listed, the nearest smaller tier is scaled per unit.
          </p>
          <p className="mt-1">
            Costs are set per product and apply to all of its variants. Open <em>Variants</em> on a product if a size or color costs
            something different.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-3" />
            <input className="input pl-8" placeholder="Search products or SKUs" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
            Missing costs only {missingCount > 0 && <span className="badge text-warn-text">{missingCount}</span>}
          </label>
        </div>
        {editor && (
          <div className="flex items-center gap-2">
            {recostMsg && <span className="text-xs text-ink-3">{recostMsg}</span>}
            <button
              type="button"
              className="btn-secondary"
              disabled={recosting}
              onClick={() =>
                startRecost(async () => {
                  const r = await recostOrdersAction();
                  setRecostMsg(`Re-priced ${r.orders} orders`);
                })
              }
              title="Re-price every past order with the costs below"
            >
              {recosting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Apply to past orders
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {filtered.map((p) => (
          <ProductCard key={p.productId} product={p} currency={currency} editor={editor} />
        ))}
        {filtered.length === 0 && <div className="card p-8 text-center text-sm text-ink-3">No products match.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ProductCard({ product, currency, editor }: { product: ProductCostData; currency: string; editor: boolean }) {
  const [showVariants, setShowVariants] = useState(false);
  const units = product.variants.reduce((s, v) => s + v.unitsSold, 0);
  const price = product.variants[0]?.price ?? 0;
  const overrides = product.variants.filter((v) => v.tiers.length > 0).length;
  const shopifyCost = product.variants.find((v) => v.shopifyUnitCost !== null)?.shopifyUnitCost ?? null;
  const quantitiesBought = [...new Set(product.variants.flatMap((v) => v.quantitiesBought))].sort((a, b) => a - b);
  const status =
    product.tiers.length > 0 || overrides === product.variants.length
      ? { label: "Costs set", tone: "text-good-text" }
      : overrides > 0
        ? { label: "Some variants missing", tone: "text-warn-text" }
        : { label: "No costs yet", tone: "text-warn-text" };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="h-12 w-12 shrink-0 rounded-lg bg-surface-2" />
          )}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{product.title}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
              <span className={`badge ${status.tone}`}>{status.label}</span>
              <span>Sells for {fmtMoney(price, currency)}</span>
              <span>{product.variants.length} variant{product.variants.length === 1 ? "" : "s"}</span>
              <span>{fmtNumber(units)} units sold</span>
              {shopifyCost !== null && <span>Shopify cost per item {fmtMoney(shopifyCost, currency)}</span>}
            </div>
          </div>
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={() => setShowVariants((v) => !v)}>
          {showVariants ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Variants {overrides > 0 && <span className="badge">{overrides} custom</span>}
        </button>
      </div>

      <div className="border-t border-border px-4 py-3">
        <TierEditor
          key={`p-${product.productId}-${product.tiers.length}`}
          productId={product.productId}
          variantId=""
          initial={product.tiers}
          price={price}
          currency={currency}
          editor={editor}
          quantitiesBought={quantitiesBought}
          heading="Supplier cost for this product"
        />
      </div>

      {showVariants && (
        <div className="divide-y divide-border border-t border-border bg-surface-2/50">
          {product.variants.map((v) => (
            <VariantSection key={v.id} product={product} variant={v} currency={currency} editor={editor} />
          ))}
        </div>
      )}
    </div>
  );
}

function VariantSection({ product, variant, currency, editor }: { product: ProductCostData; variant: VariantCostData; currency: string; editor: boolean }) {
  const [customizing, setCustomizing] = useState(variant.tiers.length > 0);
  const [pending, start] = useTransition();
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">{variant.title}</span>
          {variant.sku && <span className="ml-2 text-xs text-ink-3">{variant.sku}</span>}
          <span className="ml-2 text-xs text-ink-3">{fmtNumber(variant.unitsSold)} sold</span>
        </div>
        {editor && !customizing && (
          <button type="button" className="btn-ghost text-xs" onClick={() => setCustomizing(true)}>
            Set different costs for this variant
          </button>
        )}
        {editor && customizing && (
          <button
            type="button"
            className="btn-ghost text-xs"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await clearVariantTiersAction(product.productId, variant.shopifyId);
                setCustomizing(false);
              })
            }
          >
            <Undo2 className="h-3.5 w-3.5" /> Use product costs
          </button>
        )}
      </div>
      {customizing ? (
        <div className="mt-2">
          <TierEditor
            key={`v-${variant.id}-${variant.tiers.length}`}
            productId={product.productId}
            variantId={variant.shopifyId}
            initial={variant.tiers.length ? variant.tiers : product.tiers}
            price={variant.price}
            currency={currency}
            editor={editor}
            quantitiesBought={variant.quantitiesBought}
            heading={`Supplier cost for ${variant.title}`}
          />
        </div>
      ) : (
        <p className="mt-1 text-xs text-ink-3">Uses the product costs above.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TierEditor({
  productId,
  variantId,
  initial,
  price,
  currency,
  editor,
  quantitiesBought,
  heading,
}: {
  productId: string;
  variantId: string;
  initial: TierRow[];
  price: number;
  currency: string;
  editor: boolean;
  quantitiesBought: number[];
  heading: string;
}) {
  const toRows = (t: TierRow[]) => t.map((x) => ({ quantity: String(x.quantity), productCost: String(x.productCost), shippingCost: String(x.shippingCost) }));
  const [rows, setRows] = useState(() => (initial.length ? toRows(initial) : [{ quantity: "1", productCost: "", shippingCost: "" }]));
  const [saved, setSaved] = useState<TierRow[]>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const parsed: TierInput[] = rows
    .map((r) => ({ quantity: Number(r.quantity), productCost: Number(r.productCost || 0), shippingCost: Number(r.shippingCost || 0) }))
    .filter((r) => Number.isInteger(r.quantity) && r.quantity > 0);
  const dirty = JSON.stringify(parsed) !== JSON.stringify(saved.map((t) => ({ quantity: t.quantity, productCost: t.productCost, shippingCost: t.shippingCost })));
  const nextQty = (Math.max(0, ...parsed.map((r) => r.quantity)) || 0) + 1;
  const unlisted = quantitiesBought.filter((q) => !parsed.some((r) => r.quantity === q));

  function update(i: number, key: keyof (typeof rows)[number], value: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  function save() {
    start(async () => {
      const r = await saveTiersAction(productId, variantId, parsed);
      if (r?.error) setMsg({ ok: false, text: r.error });
      else {
        setSaved(parsed);
        setMsg({ ok: true, text: r?.success ?? "Saved" });
        setTimeout(() => setMsg(null), 2000);
      }
    });
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium text-ink-2">{heading}</div>
        {unlisted.length > 0 && (
          <div className="text-xs text-warn-text">
            Customers bought {unlisted.map((q) => `${q}×`).join(", ")} — add those tiers for exact costs
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3">
              <th className="py-1 pr-3 font-medium">Bundle</th>
              <th className="py-1 pr-3 font-medium">Product cost</th>
              <th className="py-1 pr-3 font-medium">Shipping</th>
              <th className="py-1 pr-3 text-right font-medium">Total cost</th>
              <th className="py-1 pr-3 text-right font-medium">Per unit</th>
              <th className="py-1 pr-3 text-right font-medium">Sells for</th>
              <th className="py-1 pr-3 text-right font-medium">Margin</th>
              {editor && <th className="py-1"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const q = Number(r.quantity) || 0;
              const total = Number(r.productCost || 0) + Number(r.shippingCost || 0);
              const sells = price * q;
              const margin = safeDiv(sells - total, sells);
              return (
                <tr key={i} className="border-t border-border">
                  <td className="py-1.5 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink-3">Qty</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="input w-16 py-1 text-center"
                        value={r.quantity}
                        readOnly={!editor}
                        onChange={(e) => update(i, "quantity", e.target.value)}
                      />
                    </div>
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input w-28 py-1 text-right tnum"
                      placeholder="0.00"
                      value={r.productCost}
                      readOnly={!editor}
                      onChange={(e) => update(i, "productCost", e.target.value)}
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input w-28 py-1 text-right tnum"
                      placeholder="0.00"
                      value={r.shippingCost}
                      readOnly={!editor}
                      onChange={(e) => update(i, "shippingCost", e.target.value)}
                    />
                  </td>
                  <td className="py-1.5 pr-3 text-right tnum font-medium">{fmtMoney(total, currency)}</td>
                  <td className="py-1.5 pr-3 text-right tnum text-ink-2">{q > 0 ? fmtMoney(total / q, currency) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right tnum text-ink-2">{fmtMoney(sells, currency)}</td>
                  <td className={`py-1.5 pr-3 text-right tnum ${margin < 0.3 && sells > 0 ? "text-warn-text" : ""}`}>{sells > 0 ? fmtPercent(margin, 0) : "—"}</td>
                  {editor && (
                    <td className="py-1.5 text-right">
                      <button type="button" className="btn-ghost px-1.5 py-1" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} aria-label="Remove tier">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editor && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost text-xs" onClick={() => setRows((rs) => [...rs, { quantity: String(nextQty), productCost: "", shippingCost: "" }])}>
            <Plus className="h-3.5 w-3.5" /> Add qty {nextQty}
          </button>
          {parsed.length > 0 && nextQty > 1 && (
            <span className="text-xs text-ink-3">
              Qty {nextQty} would currently be estimated at {fmtMoney(estimate(parsed, nextQty), currency)}
            </span>
          )}
          <span className="flex-1" />
          {msg && <span className={`text-xs ${msg.ok ? "text-good-text" : "text-bad-text"}`}>{msg.text}</span>}
          <button type="button" className="btn-primary py-1.5 text-xs" disabled={!dirty || pending} onClick={save}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save costs
          </button>
        </div>
      )}
    </div>
  );
}

function estimate(tiers: TierInput[], quantity: number): number {
  const r = resolveTier(tiers, quantity);
  return r ? r.productCost + r.shippingCost : 0;
}

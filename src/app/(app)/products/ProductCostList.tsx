"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Gift, Info, Loader2, Plus, RefreshCw, Search, Trash2, Undo2 } from "lucide-react";
import { clearVariantTiersAction, recostOrdersAction, saveTiersAction, type TierInput } from "@/lib/actions/costs";
import { resolveTier } from "@/lib/costing";
import { MARKETS, marketLabel } from "@/lib/constants";
import { fmtMoney, fmtNumber, fmtPercent, safeDiv } from "@/lib/format";

export type TierRow = { quantity: number; productCost: number; shippingCost: number; sellPrice: number | null };
/** Observed average net price per bundle size, from real orders. */
export type SoldPrices = Record<number, { avg: number; count: number }>;
/** Tiers keyed by country code; "" is the default used for any other country. */
export type TiersByCountry = Record<string, TierRow[]>;

export type VariantCostData = {
  id: string;
  shopifyId: string;
  title: string;
  sku: string | null;
  price: number; // Shopify list price
  shopifyUnitCost: number | null;
  unitsSold: number;
  quantitiesBought: number[];
  tiers: TiersByCountry;
};

export type ProductCostData = {
  productId: string;
  title: string;
  imageUrl: string | null;
  tiers: TiersByCountry;
  unitsByCountry: Record<string, number>;
  variants: VariantCostData[];
  soldPrices: SoldPrices;
  isFreeGift: boolean;
};

const hasAny = (t: TiersByCountry) => Object.values(t).some((x) => x.length > 0);

// ---------------------------------------------------------------------------

export function ProductCostList({ products, currency, editor }: { products: ProductCostData[]; currency: string; editor: boolean }) {
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [recosting, startRecost] = useTransition();
  const [recostMsg, setRecostMsg] = useState<string | null>(null);

  const isMissing = (p: ProductCostData) => !hasAny(p.tiers) && p.variants.some((v) => !hasAny(v.tiers));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (onlyMissing && !isMissing(p)) return false;
      if (!q) return true;
      return p.title.toLowerCase().includes(q) || p.variants.some((v) => v.sku?.toLowerCase().includes(q) || v.title.toLowerCase().includes(q));
    });
  }, [products, query, onlyMissing]);

  const missingCount = products.filter(isMissing).length;

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
            <strong className="text-ink">Default</strong> costs apply everywhere. Fill in a country tab (US, CA, AU, UK, NZ) when that
            country costs something different. Each order is priced by the country it ships to.
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

function CountryTabs({
  value,
  onChange,
  tiers,
  units,
}: {
  value: string;
  onChange: (c: string) => void;
  tiers: TiersByCountry;
  units: Record<string, number>;
}) {
  const tabs = [{ code: "", short: "Default" }, ...MARKETS.map((m) => ({ code: m.code, short: m.short }))];
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
      {tabs.map((t) => {
        const set = (tiers[t.code]?.length ?? 0) > 0;
        const sold = t.code === "" ? Object.entries(units).filter(([c]) => !MARKETS.some((m) => m.code === c)).reduce((s, [, n]) => s + n, 0) : (units[t.code] ?? 0);
        const active = value === t.code;
        return (
          <button
            key={t.code}
            type="button"
            onClick={() => onChange(t.code)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              active ? "bg-accent-soft text-accent" : "text-ink-2 hover:text-ink"
            }`}
            title={t.code === "" ? "Used for any country without its own costs" : `${marketLabel(t.code)} · ${sold} units sold`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${set ? "bg-good" : "bg-border-strong"}`} />
            {t.short}
            {sold > 0 && <span className="text-[10px] text-ink-3">{fmtNumber(sold)}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ProductCard({ product, currency, editor }: { product: ProductCostData; currency: string; editor: boolean }) {
  const [showVariants, setShowVariants] = useState(false);
  const [country, setCountry] = useState("");
  const units = product.variants.reduce((s, v) => s + v.unitsSold, 0);
  const price = product.variants[0]?.price ?? 0;
  const overrides = product.variants.filter((v) => hasAny(v.tiers)).length;
  const shopifyCost = product.variants.find((v) => v.shopifyUnitCost !== null)?.shopifyUnitCost ?? null;
  const quantitiesBought = [...new Set(product.variants.flatMap((v) => v.quantitiesBought))].sort((a, b) => a - b);
  const countriesSet = MARKETS.filter((m) => (product.tiers[m.code]?.length ?? 0) > 0).map((m) => m.short);
  const status =
    hasAny(product.tiers) || overrides === product.variants.length
      ? { label: "Costs set", tone: "text-good-text" }
      : overrides > 0
        ? { label: "Some variants missing", tone: "text-warn-text" }
        : { label: "No costs yet", tone: "text-warn-text" };

  const currentTiers = product.tiers[country] ?? [];
  const fallback = country !== "" && currentTiers.length === 0 ? product.tiers[""] ?? [] : [];

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
              {product.isFreeGift ? (
                <span className="badge text-accent">
                  <Gift className="h-3 w-3" /> Free gift
                </span>
              ) : (
                <span className={`badge ${status.tone}`}>{status.label}</span>
              )}
              <span>List {fmtMoney(price, currency)}</span>
              {product.soldPrices[1] && !product.isFreeGift && (
                <span title={`Average paid for a single unit across ${product.soldPrices[1].count} orders`}>
                  Sells at {fmtMoney(product.soldPrices[1].avg, currency)}
                </span>
              )}
              <span>{product.variants.length} variant{product.variants.length === 1 ? "" : "s"}</span>
              <span>{fmtNumber(units)} units sold</span>
              {countriesSet.length > 0 && <span>Country costs: {countriesSet.join(", ")}</span>}
              {shopifyCost !== null && <span>Shopify cost per item {fmtMoney(shopifyCost, currency)}</span>}
            </div>
            {product.isFreeGift && (
              <p className="mt-1 text-xs text-ink-3">
                Always given away at $0 in orders. Its cost is charged to the paid product in the same order, so enter what it costs you below (or mark it no cost).
              </p>
            )}
          </div>
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={() => setShowVariants((v) => !v)}>
          {showVariants ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Variants {overrides > 0 && <span className="badge">{overrides} custom</span>}
        </button>
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CountryTabs value={country} onChange={setCountry} tiers={product.tiers} units={product.unitsByCountry} />
          <span className="text-xs text-ink-3">
            {country === "" ? "Applies to every country without its own costs" : `Orders shipping to ${marketLabel(country)}`}
          </span>
        </div>
        <TierEditor
          key={`p-${product.productId}-${country}-${currentTiers.length}`}
          productId={product.productId}
          variantId=""
          country={country}
          initial={currentTiers}
          template={fallback}
          price={price}
          soldPrices={product.soldPrices}
          currency={currency}
          editor={editor}
          quantitiesBought={quantitiesBought}
          heading={country === "" ? "Default supplier cost for this product" : `Supplier cost when shipping to ${marketLabel(country)}`}
        />
      </div>

      {showVariants && (
        <div className="divide-y divide-border border-t border-border bg-surface-2/50">
          {product.variants.map((v) => (
            <VariantSection key={v.id} product={product} variant={v} country={country} currency={currency} editor={editor} />
          ))}
        </div>
      )}
    </div>
  );
}

function VariantSection({
  product,
  variant,
  country,
  currency,
  editor,
}: {
  product: ProductCostData;
  variant: VariantCostData;
  country: string;
  currency: string;
  editor: boolean;
}) {
  const own = variant.tiers[country] ?? [];
  const [customizing, setCustomizing] = useState(own.length > 0);
  const [pending, start] = useTransition();
  const template = own.length ? [] : product.tiers[country] ?? product.tiers[""] ?? [];
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">{variant.title}</span>
          {variant.sku && <span className="ml-2 text-xs text-ink-3">{variant.sku}</span>}
          <span className="ml-2 text-xs text-ink-3">{fmtNumber(variant.unitsSold)} sold</span>
          <span className="ml-2 text-xs text-ink-3">List {fmtMoney(variant.price, currency)}</span>
        </div>
        {editor && !customizing && (
          <button type="button" className="btn-ghost text-xs" onClick={() => setCustomizing(true)}>
            Set different {marketLabel(country)} costs for this variant
          </button>
        )}
        {editor && customizing && (
          <button
            type="button"
            className="btn-ghost text-xs"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await clearVariantTiersAction(product.productId, variant.shopifyId, country);
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
            key={`v-${variant.id}-${country}-${own.length}`}
            productId={product.productId}
            variantId={variant.shopifyId}
            country={country}
            initial={own}
            template={template}
            price={variant.price}
            soldPrices={product.soldPrices}
            currency={currency}
            editor={editor}
            quantitiesBought={variant.quantitiesBought}
            heading={`${marketLabel(country)} supplier cost for ${variant.title}`}
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
  country,
  initial,
  template,
  price,
  soldPrices,
  currency,
  editor,
  quantitiesBought,
  heading,
}: {
  productId: string;
  variantId: string;
  country: string;
  initial: TierRow[];
  /** Tiers this editor falls back to while empty (default costs); offered as a starting point. */
  template: TierRow[];
  price: number;
  soldPrices: SoldPrices;
  currency: string;
  editor: boolean;
  quantitiesBought: number[];
  heading: string;
}) {
  const toRows = (t: TierRow[]) =>
    t.map((x) => ({ quantity: String(x.quantity), productCost: String(x.productCost), shippingCost: String(x.shippingCost), sellPrice: x.sellPrice === null ? "" : String(x.sellPrice) }));
  const blank = { quantity: "1", productCost: "", shippingCost: "", sellPrice: "" };
  const [rows, setRows] = useState(() => (initial.length ? toRows(initial) : [blank]));
  const [saved, setSaved] = useState<TierRow[]>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const parsed: TierInput[] = rows
    .map((r) => ({
      quantity: Number(r.quantity),
      productCost: Number(r.productCost || 0),
      shippingCost: Number(r.shippingCost || 0),
      sellPrice: r.sellPrice === "" ? null : Number(r.sellPrice),
    }))
    .filter((r) => Number.isInteger(r.quantity) && r.quantity > 0);
  const dirty =
    JSON.stringify(parsed) !==
    JSON.stringify(saved.map((t) => ({ quantity: t.quantity, productCost: t.productCost, shippingCost: t.shippingCost, sellPrice: t.sellPrice })));
  /** What a bundle of q units sells for: your override, else the average from orders, else list price × q. */
  const sellsFor = (q: number, override: string) => {
    if (override !== "") return { value: Number(override), source: "override" as const };
    const obs = soldPrices[q];
    if (obs && obs.count > 0) return { value: obs.avg, source: "orders" as const };
    return { value: price * q, source: "list" as const };
  };
  const nextQty = (Math.max(0, ...parsed.map((r) => r.quantity)) || 0) + 1;
  const unlisted = quantitiesBought.filter((q) => !parsed.some((r) => r.quantity === q));
  const usingFallback = saved.length === 0 && template.length > 0;

  function update(i: number, key: keyof (typeof rows)[number], value: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  function save() {
    start(async () => {
      const r = await saveTiersAction(productId, variantId, parsed, country);
      if (r?.error) setMsg({ ok: false, text: r.error });
      else {
        setSaved(parsed.map((t) => ({ ...t, sellPrice: t.sellPrice ?? null })));
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
      {usingFallback && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
          <span>Currently using the default costs ({template.map((t) => `qty ${t.quantity}: ${fmtMoney(t.productCost + t.shippingCost, currency)}`).join(", ")}).</span>
          {editor && (
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setRows(toRows(template))}>
              <Copy className="h-3.5 w-3.5" /> Start from default
            </button>
          )}
        </div>
      )}
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
              <th className="py-1 pr-3 text-right font-medium">Profit</th>
              <th className="py-1 pr-3 text-right font-medium">Margin</th>
              {editor && <th className="py-1"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const q = Number(r.quantity) || 0;
              const total = Number(r.productCost || 0) + Number(r.shippingCost || 0);
              const sf = sellsFor(q, r.sellPrice);
              const sells = sf.value;
              const obs = soldPrices[q];
              const margin = safeDiv(sells - total, sells);
              return (
                <tr key={i} className="border-t border-border">
                  <td className="py-1.5 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink-3">Qty</span>
                      <input type="number" min="1" step="1" className="input w-16 py-1 text-center" value={r.quantity} readOnly={!editor} onChange={(e) => update(i, "quantity", e.target.value)} />
                    </div>
                  </td>
                  <td className="py-1.5 pr-3">
                    <input type="number" min="0" step="0.01" className="input w-28 py-1 text-right tnum" placeholder="0.00" value={r.productCost} readOnly={!editor} onChange={(e) => update(i, "productCost", e.target.value)} />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input type="number" min="0" step="0.01" className="input w-28 py-1 text-right tnum" placeholder="0.00" value={r.shippingCost} readOnly={!editor} onChange={(e) => update(i, "shippingCost", e.target.value)} />
                  </td>
                  <td className="py-1.5 pr-3 text-right tnum font-medium">{fmtMoney(total, currency)}</td>
                  <td className="py-1.5 pr-3 text-right tnum text-ink-2">{q > 0 ? fmtMoney(total / q, currency) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input w-28 py-1 text-right tnum"
                      placeholder={sf.source === "orders" ? String(obs?.avg ?? "") : String(price * q)}
                      value={r.sellPrice}
                      readOnly={!editor}
                      onChange={(e) => update(i, "sellPrice", e.target.value)}
                      title={sf.source === "orders" ? `Average paid across ${obs?.count} orders. Type a price to override.` : "No orders at this quantity yet; list price shown. Type what it sells for."}
                    />
                    <div className="mt-0.5 text-[10px] text-ink-3">
                      {sf.source === "override" ? `your price · orders avg ${obs ? fmtMoney(obs.avg, currency) : "n/a"}` : sf.source === "orders" ? `avg of ${obs?.count} orders` : "list price"}
                    </div>
                  </td>
                  <td className={`py-1.5 pr-3 text-right tnum font-medium ${sells - total < 0 ? "text-bad-text" : ""}`}>{fmtMoney(sells - total, currency)}</td>
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
          <button type="button" className="btn-ghost text-xs" onClick={() => setRows((rs) => [...rs, { ...blank, quantity: String(nextQty) }])}>
            <Plus className="h-3.5 w-3.5" /> Add qty {nextQty}
          </button>
          {saved.length === 0 && country === "" && (
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={pending}
              title="Digital downloads, free bonuses, gifts"
              onClick={() =>
                start(async () => {
                  const zero = [{ quantity: 1, productCost: 0, shippingCost: 0, sellPrice: null }];
                  const r = await saveTiersAction(productId, variantId, zero, country);
                  if (r?.error) setMsg({ ok: false, text: r.error });
                  else {
                    setRows(toRows(zero));
                    setSaved(zero);
                    setMsg({ ok: true, text: "Marked as no cost" });
                    setTimeout(() => setMsg(null), 2000);
                  }
                })
              }
            >
              No cost (digital or bonus)
            </button>
          )}
          {parsed.length > 0 && nextQty > 1 && (
            <span className="text-xs text-ink-3">Qty {nextQty} would currently be estimated at {fmtMoney(estimate(parsed, nextQty), currency)}</span>
          )}
          <span className="flex-1" />
          {msg && <span className={`text-xs ${msg.ok ? "text-good-text" : "text-bad-text"}`}>{msg.text}</span>}
          {saved.length > 0 && country !== "" && (
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={pending}
              title="Remove these country costs and use the default again"
              onClick={() =>
                start(async () => {
                  const r = await saveTiersAction(productId, variantId, [], country);
                  if (r?.error) setMsg({ ok: false, text: r.error });
                  else {
                    setSaved([]);
                    setRows([blank]);
                    setMsg({ ok: true, text: "Back to default costs" });
                    setTimeout(() => setMsg(null), 2000);
                  }
                })
              }
            >
              <Undo2 className="h-3.5 w-3.5" /> Use default
            </button>
          )}
          <button type="button" className="btn-primary py-1.5 text-xs" disabled={!dirty || pending} onClick={save}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save {country === "" ? "default" : marketLabel(country)} costs
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


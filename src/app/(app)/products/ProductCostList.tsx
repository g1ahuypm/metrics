"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Gift, Info, Loader2, Plus, Search, Trash2, Undo2 } from "lucide-react";
import { clearVariantTiersAction, saveTiersAction, type TierInput } from "@/lib/actions/costs";
import { resolveTier } from "@/lib/costing";
import { MARKETS, marketLabel } from "@/lib/constants";
import { fmtMoney, fmtNumber, fmtPercent, safeDiv } from "@/lib/format";

export type TierRow = { quantity: number; productCost: number; shippingCost: number };
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
  soldPricesByCountry: Record<string, SoldPrices>;
  isFreeGift: boolean;
};

const hasAny = (t: TiersByCountry) => Object.values(t).some((x) => x.length > 0);

/** Costs are entered per country. Tiers under "" are either "No cost" ($0 everywhere) or older all-country costs. */
function costCoverage(p: ProductCostData) {
  const all = p.tiers[""] ?? [];
  const noCost = all.length > 0 && all.every((t) => t.productCost === 0 && t.shippingCost === 0);
  const legacyAll = all.length > 0 && !noCost ? all : [];
  const covered = (c: string) =>
    noCost || legacyAll.length > 0 || (p.tiers[c]?.length ?? 0) > 0 || (p.variants.length > 0 && p.variants.every((v) => (v.tiers[c]?.length ?? 0) > 0));
  const soldIn = Object.entries(p.unitsByCountry).filter(([, n]) => n > 0).map(([c]) => c);
  const missing = soldIn.filter((c) => !covered(c)).sort((a, b) => (p.unitsByCountry[b] ?? 0) - (p.unitsByCountry[a] ?? 0));
  const anyCountry = MARKETS.some((m) => (p.tiers[m.code]?.length ?? 0) > 0) || p.variants.some((v) => hasAny(v.tiers));
  return { noCost, legacyAll, missing, anyCountry };
}

const countryName = (code: string) => (code ? (MARKETS.find((m) => m.code === code)?.label ?? code) : "other countries");

// ---------------------------------------------------------------------------

export function ProductCostList({ products, currency, editor }: { products: ProductCostData[]; currency: string; editor: boolean }) {
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const isMissing = (p: ProductCostData) => costCoverage(p).missing.length > 0;

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
            Enter costs for each country you ship to. Every order is priced by the country it ships to. An{" "}
            <span className="font-medium text-warn-text">amber</span> country has sales but no costs yet.
          </p>
          <p className="mt-1">
            Saving updates every past order with this product right away, on every page.
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
  missing,
}: {
  value: string;
  onChange: (c: string) => void;
  tiers: TiersByCountry;
  units: Record<string, number>;
  missing: string[];
}) {
  const tabs = MARKETS.map((m) => ({ code: m.code, short: m.short }));
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
      {tabs.map((t) => {
        const set = (tiers[t.code]?.length ?? 0) > 0;
        const sold = units[t.code] ?? 0;
        const active = value === t.code;
        return (
          <button
            key={t.code}
            type="button"
            onClick={() => onChange(t.code)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              active ? "bg-accent-soft text-accent" : "text-ink-2 hover:text-ink"
            }`}
            title={`${countryName(t.code)} · ${sold} units sold · ${set ? "costs set" : missing.includes(t.code) ? "no costs yet" : "no costs of its own"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${set ? "bg-good" : missing.includes(t.code) ? "bg-warn" : "bg-border-strong"}`} />
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
  // Open on the country with the most sales.
  const [country, setCountry] = useState(() => [...MARKETS].sort((a, b) => (product.unitsByCountry[b.code] ?? 0) - (product.unitsByCountry[a.code] ?? 0))[0].code);
  const [pending, start] = useTransition();
  const coverage = costCoverage(product);
  const units = product.variants.reduce((s, v) => s + v.unitsSold, 0);
  const price = product.variants[0]?.price ?? 0;
  const overrides = product.variants.filter((v) => hasAny(v.tiers)).length;
  const shopifyCost = product.variants.find((v) => v.shopifyUnitCost !== null)?.shopifyUnitCost ?? null;
  const quantitiesBought = [...new Set(product.variants.flatMap((v) => v.quantitiesBought))].sort((a, b) => a - b);
  const status = coverage.noCost
    ? { label: "No cost", tone: "text-ink-2" }
    : coverage.missing.length > 0
      ? { label: `Missing costs: ${coverage.missing.map((c) => (c ? marketLabel(c) : "unknown")).join(", ")}`, tone: "text-warn-text" }
      : coverage.anyCountry || coverage.legacyAll.length > 0
        ? { label: "Costs set", tone: "text-good-text" }
        : { label: "No costs yet", tone: "text-ink-3" };

  const currentTiers = product.tiers[country] ?? [];
  // Countries that already have costs, offered as a starting point for an empty one.
  const copyFrom = MARKETS.filter((m) => m.code !== country && (product.tiers[m.code]?.length ?? 0) > 0).map((m) => ({ label: m.short, tiers: product.tiers[m.code] }));
  const removeAllCountry = (tiers: TierInput[]) => start(async () => void (await saveTiersAction(product.productId, "", tiers, "")));

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

      {coverage.noCost ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm text-ink-2">
          <span>No cost in any country (digital or bonus item).</span>
          {editor && (
            <button type="button" className="btn-ghost text-xs" disabled={pending} onClick={() => removeAllCountry([])}>
              <Undo2 className="h-3.5 w-3.5" /> It has a cost
            </button>
          )}
        </div>
      ) : (
        <div className="border-t border-border px-4 py-3">
          {coverage.legacyAll.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn-text">
              <span>
                Older costs for all countries ({coverage.legacyAll.map((t) => `qty ${t.quantity}: ${fmtMoney(t.productCost + t.shippingCost, currency)}`).join(", ")}) still
                apply wherever a country below is empty.
              </span>
              {editor && (
                <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => removeAllCountry([])}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove them
                </button>
              )}
            </div>
          )}
          <div className="mb-3">
            <CountryTabs value={country} onChange={setCountry} tiers={product.tiers} units={product.unitsByCountry} missing={coverage.missing} />
          </div>
          <TierEditor
            key={`p-${product.productId}-${country}`}
            productId={product.productId}
            variantId=""
            country={country}
            initial={currentTiers}
            copyFrom={copyFrom}
            offerNoCost={!coverage.anyCountry && coverage.legacyAll.length === 0}
            price={price}
            soldPrices={product.soldPrices}
            countryPrices={product.soldPricesByCountry[country] ?? {}}
            currency={currency}
            editor={editor}
            quantitiesBought={quantitiesBought}
            heading={`Supplier cost when shipping to ${countryName(country)}`}
          />
        </div>
      )}

      {showVariants && !coverage.noCost && (
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
  const [msg, setMsg] = useState<string | null>(null);
  const productTiers = product.tiers[country] ?? [];
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
            Set different {countryName(country)} costs for this variant
          </button>
        )}
        {editor && customizing && (
          <button
            type="button"
            className="btn-ghost text-xs"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await clearVariantTiersAction(product.productId, variant.shopifyId, country);
                setCustomizing(false);
                setMsg(r?.success ?? null);
                setTimeout(() => setMsg(null), 5000);
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
            key={`v-${variant.id}-${country}`}
            productId={product.productId}
            variantId={variant.shopifyId}
            country={country}
            initial={own}
            copyFrom={productTiers.length ? [{ label: "product costs", tiers: productTiers }] : []}
            offerNoCost={false}
            price={variant.price}
            soldPrices={product.soldPrices}
            countryPrices={product.soldPricesByCountry[country] ?? {}}
            currency={currency}
            editor={editor}
            quantitiesBought={variant.quantitiesBought}
            heading={`${countryName(country)} supplier cost for ${variant.title}`}
          />
        </div>
      ) : (
        <p className="mt-1 text-xs text-ink-3">
          Uses the {countryName(country)} product costs above.{msg && <span className="ml-2 text-good-text">{msg}</span>}
        </p>
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
  copyFrom,
  offerNoCost,
  price,
  soldPrices,
  countryPrices,
  currency,
  editor,
  quantitiesBought,
  heading,
}: {
  productId: string;
  variantId: string;
  country: string;
  initial: TierRow[];
  /** Filled-in costs (other countries, or the product's) offered as a starting point while this one is empty. */
  copyFrom: { label: string; tiers: TierRow[] }[];
  /** Offer "No cost (digital or bonus)", which sets $0 for every country. */
  offerNoCost: boolean;
  price: number;
  soldPrices: SoldPrices;
  /** The same, only for orders shipping to this editor's country. */
  countryPrices: SoldPrices;
  currency: string;
  editor: boolean;
  quantitiesBought: number[];
  heading: string;
}) {
  const toRows = (t: TierRow[]) =>
    t.map((x) => ({ quantity: String(x.quantity), productCost: String(x.productCost), shippingCost: String(x.shippingCost) }));
  const blank = { quantity: "1", productCost: "", shippingCost: "" };
  const [rows, setRows] = useState(() => (initial.length ? toRows(initial) : [blank]));
  const [saved, setSaved] = useState<TierRow[]>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const parsed: TierInput[] = rows
    .map((r) => ({
      quantity: Number(r.quantity),
      productCost: Number(r.productCost || 0),
      shippingCost: Number(r.shippingCost || 0),
    }))
    .filter((r) => Number.isInteger(r.quantity) && r.quantity > 0);
  const dirty =
    JSON.stringify(parsed) !==
    JSON.stringify(saved.map((t) => ({ quantity: t.quantity, productCost: t.productCost, shippingCost: t.shippingCost })));
  /**
   * What customers pay for a bundle of q units: the average of real orders to this
   * country (what the P&L uses), else of all countries, else list price × q.
   */
  const paidFor = (q: number) => {
    const here = countryPrices[q];
    if (here?.count) return { value: here.avg, note: `avg of ${here.count} ${marketLabel(country)} order${here.count === 1 ? "" : "s"}`, real: true };
    const all = soldPrices[q];
    if (all?.count) return { value: all.avg, note: `avg of ${all.count} order${all.count === 1 ? "" : "s"}, all countries`, real: true };
    return { value: price * q, note: "list price · no orders yet", real: false };
  };
  const nextQty = (Math.max(0, ...parsed.map((r) => r.quantity)) || 0) + 1;
  const unlisted = quantitiesBought.filter((q) => !parsed.some((r) => r.quantity === q));
  const isEmpty = saved.length === 0 && rows.every((r) => r.productCost === "" && r.shippingCost === "");

  function update(i: number, key: keyof (typeof rows)[number], value: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  function save() {
    start(async () => {
      const r = await saveTiersAction(productId, variantId, parsed, country);
      if (r?.error) setMsg({ ok: false, text: r.error });
      else {
        setSaved(parsed);
        setMsg({ ok: true, text: r?.success ?? "Saved" });
        setTimeout(() => setMsg(null), 5000);
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
      {isEmpty && editor && copyFrom.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
          <span>Nothing entered here yet. Copy from</span>
          {copyFrom.map((c) => (
            <button key={c.label} type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setRows(toRows(c.tiers))}>
              <Copy className="h-3.5 w-3.5" /> {c.label}
            </button>
          ))}
          <span>then change what differs.</span>
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
              <th className="py-1 pr-3 text-right font-medium">Customers paid</th>
              <th className="py-1 pr-3 text-right font-medium">Profit</th>
              <th className="py-1 pr-3 text-right font-medium">Margin</th>
              {editor && <th className="py-1"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const q = Number(r.quantity) || 0;
              const total = Number(r.productCost || 0) + Number(r.shippingCost || 0);
              // Profit means nothing until a cost is entered.
              const entered = r.productCost !== "" || r.shippingCost !== "";
              const paid = paidFor(q);
              const sells = paid.value;
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
                  <td className="py-1.5 pr-3 text-right tnum font-medium">{entered ? fmtMoney(total, currency) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right tnum text-ink-2">{entered && q > 0 ? fmtMoney(total / q, currency) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right">
                    <div className={`tnum ${paid.real ? "font-medium" : "text-ink-3"}`}>{fmtMoney(sells, currency)}</div>
                    <div className="whitespace-nowrap text-[10px] text-ink-3">{paid.note}</div>
                  </td>
                  <td className={`py-1.5 pr-3 text-right tnum font-medium ${entered && sells - total < 0 ? "text-bad-text" : ""}`}>{entered ? fmtMoney(sells - total, currency) : "—"}</td>
                  <td className={`py-1.5 pr-3 text-right tnum ${entered && margin < 0.3 && sells > 0 ? "text-warn-text" : ""}`}>{entered && sells > 0 ? fmtPercent(margin, 0) : "—"}</td>
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
      <p className="mt-1.5 text-[11px] text-ink-3">
        Customers paid is the average of your real orders at each bundle size to this country, after discounts. It is the same number your Profit &amp; Loss uses.
        To change it, change the price or discount in Shopify.
      </p>
      {editor && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost text-xs" onClick={() => setRows((rs) => [...rs, { ...blank, quantity: String(nextQty) }])}>
            <Plus className="h-3.5 w-3.5" /> Add qty {nextQty}
          </button>
          {saved.length === 0 && offerNoCost && (
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={pending}
              title="Digital downloads, free bonuses, gifts"
              onClick={() =>
                start(async () => {
                  const zero = [{ quantity: 1, productCost: 0, shippingCost: 0 }];
                  const r = await saveTiersAction(productId, variantId, zero, "");
                  if (r?.error) setMsg({ ok: false, text: r.error });
                  else {
                    setRows(toRows(zero));
                    setSaved(zero);
                    setMsg({ ok: true, text: r?.success ?? "Saved" });
                    setTimeout(() => setMsg(null), 5000);
                  }
                })
              }
            >
              No cost (digital or bonus)
            </button>
          )}
          {parsed.some((t) => t.productCost + t.shippingCost > 0) && nextQty > 1 && (
            <span className="text-xs text-ink-3">Qty {nextQty} would currently be estimated at {fmtMoney(estimate(parsed, nextQty), currency)}</span>
          )}
          <span className="flex-1" />
          {msg && <span className={`text-xs ${msg.ok ? "text-good-text" : "text-bad-text"}`}>{msg.text}</span>}
          {saved.length > 0 && variantId === "" && (
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={pending}
              title={`Remove the ${countryName(country)} costs`}
              onClick={() =>
                start(async () => {
                  const r = await saveTiersAction(productId, variantId, [], country);
                  if (r?.error) setMsg({ ok: false, text: r.error });
                  else {
                    setSaved([]);
                    setRows([blank]);
                    setMsg({ ok: true, text: r?.success ?? "Cleared" });
                    setTimeout(() => setMsg(null), 5000);
                  }
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear {marketLabel(country)}
            </button>
          )}
          <button type="button" className="btn-primary py-1.5 text-xs" disabled={!dirty || pending} onClick={save}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save {marketLabel(country)} costs
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


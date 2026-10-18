import { canEdit, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettingsRow } from "@/lib/integrations/config";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ProductCostList, type ProductCostData } from "./ProductCostList";

export default async function ProductsPage() {
  const user = await requireUser();
  const editor = canEdit(user.role);
  const [settings, variants, tiers, sold] = await Promise.all([
    getSettingsRow(),
    db.productVariant.findMany({ orderBy: [{ productTitle: "asc" }, { variantTitle: "asc" }] }),
    db.costTier.findMany({ orderBy: { quantity: "asc" } }),
    db.orderLineItem.findMany({
      where: { variantId: { not: null }, order: { cancelledAt: null } },
      select: { orderId: true, variantId: true, quantity: true, price: true, listPrice: true, order: { select: { country: true } } },
    }),
  ]);
  const productOfVariant = new Map(variants.map((v) => [v.id, v.productId ?? `variant:${v.shopifyId}`]));
  // A bundle is how many of a product one order holds, even when they arrive on
  // separate lines (post-purchase upsells): order+product → { quantity, price }.
  const bundles = new Map<string, { pid: string; quantity: number; price: number }>();
  for (const s of sold) {
    const pid = s.variantId ? productOfVariant.get(s.variantId) : undefined;
    if (!pid) continue;
    const key = `${s.orderId}|${pid}`;
    const b = bundles.get(key) ?? { pid, quantity: 0, price: 0 };
    b.quantity += s.quantity;
    b.price += s.price;
    bundles.set(key, b);
  }
  // What each bundle size actually sells for, from real orders: productId → quantity → { total, count, gifts }
  const soldByQty = new Map<string, Map<number, { total: number; count: number; zero: number }>>();
  for (const b of bundles.values()) {
    const m = soldByQty.get(b.pid) ?? new Map();
    const row = m.get(b.quantity) ?? { total: 0, count: 0, zero: 0 };
    row.total += b.price;
    row.count += 1;
    if (b.price === 0) row.zero += 1;
    m.set(b.quantity, row);
    soldByQty.set(b.pid, m);
  }

  // Units sold per variant, which bundle quantities customers buy, and where orders ship.
  const soldByVariant = new Map<string, { units: number; quantities: Set<number>; countries: Record<string, number> }>();
  for (const s of sold) {
    if (!s.variantId) continue;
    const row = soldByVariant.get(s.variantId) ?? { units: 0, quantities: new Set<number>(), countries: {} };
    row.units += s.quantity;
    const c = s.order.country ?? "";
    row.countries[c] = (row.countries[c] ?? 0) + s.quantity;
    soldByVariant.set(s.variantId, row);
  }
  const qtyPerOrder = new Map<string, number>();
  for (const s of sold) if (s.variantId) qtyPerOrder.set(`${s.orderId}|${s.variantId}`, (qtyPerOrder.get(`${s.orderId}|${s.variantId}`) ?? 0) + s.quantity);
  for (const [key, q] of qtyPerOrder) soldByVariant.get(key.split("|")[1])?.quantities.add(q);

  const products = new Map<string, ProductCostData>();
  for (const v of variants) {
    const productId = v.productId ?? `variant:${v.shopifyId}`;
    let p = products.get(productId);
    if (!p) {
      const m = soldByQty.get(productId) ?? new Map<number, { total: number; count: number; zero: number }>();
      const soldPrices: Record<number, { avg: number; count: number }> = {};
      let lines = 0;
      let zero = 0;
      for (const [q, r] of m) {
        soldPrices[q] = { avg: r.count ? Math.round((r.total / r.count) * 100) / 100 : 0, count: r.count };
        lines += r.count;
        zero += r.zero;
      }
      p = {
        productId,
        title: v.productTitle,
        imageUrl: v.imageUrl,
        tiers: {},
        unitsByCountry: {},
        variants: [],
        soldPrices,
        isFreeGift: lines >= 3 && zero === lines,
      };
      products.set(productId, p);
    }
    const s = soldByVariant.get(v.id);
    p.variants.push({
      id: v.id,
      shopifyId: v.shopifyId,
      title: v.variantTitle && v.variantTitle !== "Default Title" ? v.variantTitle : "Default",
      sku: v.sku,
      price: v.price,
      shopifyUnitCost: v.unitCost,
      unitsSold: s?.units ?? 0,
      quantitiesBought: s ? [...s.quantities].sort((a, b) => a - b) : [],
      tiers: {},
    });
    for (const [c, n] of Object.entries(s?.countries ?? {})) p.unitsByCountry[c] = (p.unitsByCountry[c] ?? 0) + n;
  }
  for (const t of tiers) {
    const p = products.get(t.productId);
    if (!p) continue;
    const tier = { quantity: t.quantity, productCost: t.productCost, shippingCost: t.shippingCost };
    const target = t.variantId === "" ? p.tiers : p.variants.find((v) => v.shopifyId === t.variantId)?.tiers;
    if (!target) continue;
    (target[t.country] ??= []).push(tier);
  }
  const hasTiers = (p: ProductCostData) => Object.values(p.tiers).some((t) => t.length > 0);
  const list = [...products.values()].sort((a, b) => {
    const au = a.variants.reduce((s, v) => s + v.unitsSold, 0);
    const bu = b.variants.reduce((s, v) => s + v.unitsSold, 0);
    return bu - au || a.title.localeCompare(b.title);
  });

  return (
    <div>
      <PageHeader
        title="Product costs"
        description="What you pay your supplier for each product, per bundle size. Every order is priced from these numbers automatically."
      />
      {list.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Connect Shopify in Settings and run a sync to import your products, then enter supplier costs here."
          actionHref="/settings"
          actionLabel="Connect Shopify"
        />
      ) : (
        <ProductCostList products={list} currency={settings.currency} editor={editor} />
      )}
    </div>
  );
}

import "server-only";
import { db } from "./db";
import type { ProductCostData } from "@/components/costs/ProductCostEditor";

/**
 * Everything the cost editor needs per product: variants, saved tiers by
 * country, units sold per country and per variant, bundle sizes bought, and
 * whether the product is a free gift. Pass a productId to load just that one.
 */
export async function getProductCostData(only?: string, storeIds?: string[]): Promise<ProductCostData[]> {
  const inStores = storeIds ? { storeId: { in: storeIds } } : {};
  const [variants, tiers, sold] = await Promise.all([
    db.productVariant.findMany({ where: { ...inStores, ...(only ? { productId: only } : {}) }, orderBy: [{ productTitle: "asc" }, { variantTitle: "asc" }] }),
    db.costTier.findMany({ where: only ? { productId: only } : {}, orderBy: { quantity: "asc" } }),
    db.orderLineItem.findMany({
      where: { variantId: { not: null }, order: { cancelledAt: null, ...inStores }, ...(only ? { variant: { productId: only } } : {}) },
      select: { orderId: true, variantId: true, quantity: true, price: true, order: { select: { country: true } } },
    }),
  ]);
  const productOfVariant = new Map(variants.map((v) => [v.id, v.productId ?? `variant:${v.shopifyId}`]));
  // Free gifts: products that only ever appear at $0 in orders.
  const lineStats = new Map<string, { lines: number; zero: number }>();
  for (const s of sold) {
    const pid = s.variantId ? productOfVariant.get(s.variantId) : undefined;
    if (!pid) continue;
    const st = lineStats.get(pid) ?? { lines: 0, zero: 0 };
    st.lines += 1;
    if (s.price === 0) st.zero += 1;
    lineStats.set(pid, st);
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
      const st = lineStats.get(productId) ?? { lines: 0, zero: 0 };
      p = {
        productId,
        title: v.productTitle,
        imageUrl: v.imageUrl,
        tiers: {},
        unitsByCountry: {},
        variants: [],
        isFreeGift: st.lines >= 3 && st.zero === st.lines,
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
  const list = [...products.values()].sort((a, b) => {
    const au = a.variants.reduce((s, v) => s + v.unitsSold, 0);
    const bu = b.variants.reduce((s, v) => s + v.unitsSold, 0);
    return bu - au || a.title.localeCompare(b.title);
  });

  return list;
}

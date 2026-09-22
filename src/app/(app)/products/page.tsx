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
    db.orderLineItem.groupBy({ by: ["variantId", "quantity"], _sum: { quantity: true }, where: { variantId: { not: null } } }),
  ]);

  // Units sold per variant, and which bundle quantities customers actually buy.
  const soldByVariant = new Map<string, { units: number; quantities: Set<number> }>();
  for (const s of sold) {
    if (!s.variantId) continue;
    const row = soldByVariant.get(s.variantId) ?? { units: 0, quantities: new Set<number>() };
    row.units += s._sum.quantity ?? 0;
    row.quantities.add(s.quantity);
    soldByVariant.set(s.variantId, row);
  }

  const products = new Map<string, ProductCostData>();
  for (const v of variants) {
    const productId = v.productId ?? `variant:${v.shopifyId}`;
    let p = products.get(productId);
    if (!p) {
      p = { productId, title: v.productTitle, imageUrl: v.imageUrl, tiers: [], variants: [] };
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
      tiers: [],
    });
  }
  for (const t of tiers) {
    const p = products.get(t.productId);
    if (!p) continue;
    const tier = { quantity: t.quantity, productCost: t.productCost, shippingCost: t.shippingCost };
    if (t.variantId === "") p.tiers.push(tier);
    else p.variants.find((v) => v.shopifyId === t.variantId)?.tiers.push(tier);
  }
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

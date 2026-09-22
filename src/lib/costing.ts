/**
 * Supplier cost resolution. Pure functions so the same rules run in the
 * Shopify sync, the "apply to past orders" recalculation and the demo seed.
 */

export type Tier = { quantity: number; productCost: number; shippingCost: number };

export type LineCost = {
  productCost: number; // total for the line
  shippingCost: number; // total for the line
  source: "tier" | "shopify" | "fallback" | "none";
};

export type CostBook = {
  /** key: productId → variantId ("" for product-level) → tiers sorted by quantity */
  tiers: Map<string, Map<string, Tier[]>>;
  /** key: variant shopifyId → Shopify "cost per item" */
  shopifyUnitCost: Map<string, number>;
  /** key: variant shopifyId → productId */
  productOf: Map<string, string>;
  /** key: variant shopifyId → internal variant id */
  internalId: Map<string, string>;
  fallbackCogsPercent: number;
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Picks the tier for a quantity:
 *  - exact match → that tier's totals
 *  - otherwise the closest tier below (or the smallest tier when buying less
 *    than the smallest quantity), scaled per unit
 */
export function resolveTier(tiers: Tier[], quantity: number): { productCost: number; shippingCost: number } | null {
  if (!tiers.length || quantity <= 0) return null;
  const sorted = [...tiers].sort((a, b) => a.quantity - b.quantity);
  const exact = sorted.find((t) => t.quantity === quantity);
  if (exact) return { productCost: exact.productCost, shippingCost: exact.shippingCost };
  const below = [...sorted].reverse().find((t) => t.quantity < quantity);
  const base = below ?? sorted[0];
  const factor = quantity / base.quantity;
  return { productCost: round2(base.productCost * factor), shippingCost: round2(base.shippingCost * factor) };
}

export function tiersFor(book: CostBook, productId: string | null, variantShopifyId: string | null): Tier[] {
  if (!productId) return [];
  const byVariant = book.tiers.get(productId);
  if (!byVariant) return [];
  if (variantShopifyId) {
    const v = byVariant.get(variantShopifyId);
    if (v?.length) return v;
  }
  return byVariant.get("") ?? [];
}

export function resolveLineCost(
  book: CostBook,
  variantShopifyId: string | null,
  quantity: number,
  linePrice: number,
): LineCost {
  const productId = variantShopifyId ? (book.productOf.get(variantShopifyId) ?? null) : null;
  const tiers = tiersFor(book, productId, variantShopifyId);
  const tier = resolveTier(tiers, quantity);
  if (tier) return { productCost: tier.productCost, shippingCost: tier.shippingCost, source: "tier" };

  const unit = variantShopifyId ? book.shopifyUnitCost.get(variantShopifyId) : undefined;
  if (unit !== undefined && unit !== null) {
    return { productCost: round2(unit * quantity), shippingCost: 0, source: "shopify" };
  }
  if (book.fallbackCogsPercent > 0) {
    return { productCost: round2(linePrice * (book.fallbackCogsPercent / 100)), shippingCost: 0, source: "fallback" };
  }
  return { productCost: 0, shippingCost: 0, source: "none" };
}

export type OrderCostInput = { variantShopifyId: string | null; quantity: number; price: number };

export type OrderCostResult = {
  lines: (LineCost & { unitCost: number })[];
  cogs: number;
  shippingCost: number;
  anyTier: boolean;
};

/**
 * Costs a whole order. Order-level shipping is the sum of the tier shipping when
 * any line is tier-priced; otherwise the per-order default shipping applies.
 */
export function costOrder(book: CostBook, lines: OrderCostInput[], defaultShippingCost: number): OrderCostResult {
  const costed = lines.map((l) => {
    const c = resolveLineCost(book, l.variantShopifyId, l.quantity, l.price);
    return { ...c, unitCost: l.quantity > 0 ? round2(c.productCost / l.quantity) : 0 };
  });
  const anyTier = costed.some((c) => c.source === "tier");
  const cogs = round2(costed.reduce((s, c) => s + c.productCost, 0));
  const shippingCost = anyTier
    ? round2(costed.reduce((s, c) => s + c.shippingCost, 0))
    : lines.length > 0
      ? round2(defaultShippingCost)
      : 0;
  return { lines: costed, cogs, shippingCost, anyTier };
}

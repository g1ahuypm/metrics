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
  /** key: productId → `${variantId}|${country}` ("" for product-level / default) → tiers sorted by quantity */
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

export const tierKey = (variantId: string, country: string) => `${variantId}|${country}`;

/**
 * Picks the tier list for a line, most specific first:
 * variant+country → product+country → variant default → product default.
 */
export function tiersFor(book: CostBook, productId: string | null, variantShopifyId: string | null, country: string | null): Tier[] {
  if (!productId) return [];
  const byKey = book.tiers.get(productId);
  if (!byKey) return [];
  const candidates: string[] = [];
  if (country) {
    if (variantShopifyId) candidates.push(tierKey(variantShopifyId, country));
    candidates.push(tierKey("", country));
  }
  if (variantShopifyId) candidates.push(tierKey(variantShopifyId, ""));
  candidates.push(tierKey("", ""));
  for (const k of candidates) {
    const t = byKey.get(k);
    if (t?.length) return t;
  }
  return [];
}

export function resolveLineCost(
  book: CostBook,
  variantShopifyId: string | null,
  quantity: number,
  linePrice: number,
  country: string | null = null,
): LineCost {
  const productId = variantShopifyId ? (book.productOf.get(variantShopifyId) ?? null) : null;
  const tiers = tiersFor(book, productId, variantShopifyId, country);
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
export function costOrder(book: CostBook, lines: OrderCostInput[], defaultShippingCost: number, country: string | null = null): OrderCostResult {
  // The same variant on several lines (e.g. a post-purchase upsell adds a second
  // line) ships together, so it is priced at the bundle tier for the combined quantity.
  const qtyByVariant = new Map<string, number>();
  for (const l of lines) if (l.variantShopifyId) qtyByVariant.set(l.variantShopifyId, (qtyByVariant.get(l.variantShopifyId) ?? 0) + l.quantity);
  const costed = lines.map((l) => {
    const combined = l.variantShopifyId ? (qtyByVariant.get(l.variantShopifyId) ?? l.quantity) : l.quantity;
    let c = resolveLineCost(book, l.variantShopifyId, l.quantity, l.price, country);
    if (c.source === "tier" && combined > l.quantity) {
      const whole = resolveLineCost(book, l.variantShopifyId, combined, l.price, country);
      const part = l.quantity / combined;
      c = { productCost: whole.productCost * part, shippingCost: whole.shippingCost * part, source: "tier" };
    }
    // Not rounded: a $40 bundle of 3 must add back up to $40.00, not 3 × $13.33.
    return { ...c, unitCost: l.quantity > 0 ? c.productCost / l.quantity : 0 };
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

/** A cancelled order: nothing shipped, so no product or shipping cost. */
export function uncostedOrder(lines: OrderCostInput[]): OrderCostResult {
  return { lines: lines.map(() => ({ productCost: 0, shippingCost: 0, unitCost: 0, source: "none" as const })), cogs: 0, shippingCost: 0, anyTier: false };
}

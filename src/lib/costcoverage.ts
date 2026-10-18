import { MARKETS } from "./constants";
import type { ProductCostData, TiersByCountry } from "@/components/costs/ProductCostEditor";

export const hasAnyTiers = (t: TiersByCountry) => Object.values(t).some((x) => x.length > 0);

/** Costs are entered per country. Tiers under "" are either "No cost" ($0 everywhere) or older all-country costs. */
export function costCoverage(p: ProductCostData) {
  const all = p.tiers[""] ?? [];
  const noCost = all.length > 0 && all.every((t) => t.productCost === 0 && t.shippingCost === 0);
  const legacyAll = all.length > 0 && !noCost ? all : [];
  const covered = (c: string) =>
    noCost || legacyAll.length > 0 || (p.tiers[c]?.length ?? 0) > 0 || (p.variants.length > 0 && p.variants.every((v) => (v.tiers[c]?.length ?? 0) > 0));
  const soldIn = Object.entries(p.unitsByCountry).filter(([, n]) => n > 0).map(([c]) => c);
  const missing = soldIn.filter((c) => !covered(c)).sort((a, b) => (p.unitsByCountry[b] ?? 0) - (p.unitsByCountry[a] ?? 0));
  const anyCountry = MARKETS.some((m) => (p.tiers[m.code]?.length ?? 0) > 0) || p.variants.some((v) => hasAnyTiers(v.tiers));
  return { noCost, legacyAll, missing, anyCountry };
}


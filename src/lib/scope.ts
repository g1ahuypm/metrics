import "server-only";
import { cookies } from "next/headers";
import { resolveRange, type DateRange } from "./dates";

export const PRODUCT_COOKIE = "pd_product";
export const RANGE_COOKIE = "pd_range";

export type Scope = { productId: string | undefined; range: DateRange };

/**
 * The product and date range the whole app is currently looking at.
 * Both live in cookies so they follow the user through every menu; URL
 * parameters still win when present (links, bookmarks, exports).
 */
export async function getScope(sp: { range?: string; from?: string; to?: string; product?: string } = {}): Promise<Scope> {
  const jar = await cookies();
  const productId = sp.product !== undefined ? sp.product || undefined : jar.get(PRODUCT_COOKIE)?.value || undefined;
  let rangeParams = sp;
  if (!sp.range && !(sp.from && sp.to)) {
    const saved = jar.get(RANGE_COOKIE)?.value;
    if (saved) {
      try {
        rangeParams = JSON.parse(saved) as { range?: string; from?: string; to?: string };
      } catch {
        /* ignore */
      }
    }
  }
  return { productId, range: resolveRange(rangeParams) };
}

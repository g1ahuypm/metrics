import "server-only";
import { cookies } from "next/headers";
import { resolveRange, type DateRange } from "./dates";
import { db } from "./db";

export const RANGE_COOKIE = "pd_range";

export type Scope = { productId: string | undefined; range: DateRange };

/**
 * The product and date range the whole app is currently looking at.
 * Both live in cookies so they follow the user through every menu; URL
 * parameters still win when present (links, bookmarks, exports).
 */
export async function getScope(sp: { range?: string; from?: string; to?: string; product?: string } = {}): Promise<Scope> {
  const jar = await cookies();
  // A product is only ever chosen by its own page (or an export link), never remembered.
  const productId = sp.product || undefined;
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
  // Days follow the store's timezone (taken from Shopify on every sync).
  const settings = await db.settings.findUnique({ where: { id: "default" }, select: { timezone: true } });
  return { productId, range: resolveRange(rangeParams, validTimezone(settings?.timezone)) };
}

export function validTimezone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

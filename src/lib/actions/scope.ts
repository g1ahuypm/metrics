"use server";

import { cookies } from "next/headers";
import { PRODUCT_COOKIE, RANGE_COOKIE } from "../scope";

const YEAR = 365 * 24 * 60 * 60;

export async function setProductScopeAction(productId: string | null): Promise<void> {
  const jar = await cookies();
  if (productId) jar.set(PRODUCT_COOKIE, productId, { path: "/", maxAge: YEAR, sameSite: "lax" });
  else jar.delete(PRODUCT_COOKIE);
}

export async function setRangeScopeAction(params: { range?: string; from?: string; to?: string }): Promise<void> {
  const jar = await cookies();
  jar.set(RANGE_COOKIE, JSON.stringify(params), { path: "/", maxAge: YEAR, sameSite: "lax" });
}

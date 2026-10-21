"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireSignedIn } from "../auth";
import { allowedStores, ALL_STORES, canSeeAllStores, STORE_COOKIE } from "../stores";

/** The store switcher: remembers the choice on this device. */
export async function setStoreAction(storeId: string): Promise<void> {
  const me = await requireSignedIn();
  const stores = await allowedStores(me);
  const known = stores.some((s) => s.id === storeId);
  if (!known && !canSeeAllStores(me)) return; // only the owner can pick "All stores"
  const value = known ? storeId : ALL_STORES;
  (await cookies()).set(STORE_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  revalidatePath("/", "layout");
}

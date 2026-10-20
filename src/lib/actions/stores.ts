"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireSignedIn } from "../auth";
import { allowedStores, ALL_STORES, STORE_COOKIE } from "../stores";

/** The store switcher: remembers the choice on this device. */
export async function setStoreAction(storeId: string): Promise<void> {
  const me = await requireSignedIn();
  const stores = await allowedStores(me);
  const value = storeId === ALL_STORES || !stores.some((s) => s.id === storeId) ? ALL_STORES : storeId;
  (await cookies()).set(STORE_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  revalidatePath("/", "layout");
}

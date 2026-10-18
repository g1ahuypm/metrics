"use server";

import { cookies } from "next/headers";
import { RANGE_COOKIE } from "../scope";

const YEAR = 365 * 24 * 60 * 60;

export async function setRangeScopeAction(params: { range?: string; from?: string; to?: string }): Promise<void> {
  const jar = await cookies();
  jar.set(RANGE_COOKIE, JSON.stringify(params), { path: "/", maxAge: YEAR, sameSite: "lax" });
}

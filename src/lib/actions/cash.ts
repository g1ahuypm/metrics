"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import { encrypt, decrypt } from "../crypto";
import { requireOwner } from "../auth";
import { getStoreConfig } from "../integrations/config";
import { createLinkToken, exchangePublicToken, plaidConfigured, removeItem } from "../cash/plaid";
import { matchPayouts, syncAllBanks, syncBank } from "../cash/sync";
import { syncPayouts } from "../cash/payouts";
import { categorize, matchText, ruleMatchFor } from "../cash/categorize";
import { isCategory } from "../cash/categories";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const fail = (err: unknown): Result => ({ ok: false, error: err instanceof Error ? err.message : String(err) });

/** Opens Plaid in the browser: to add a bank, or (with a connection) to log in to it again. */
export async function createLinkTokenAction(reconnectId?: string): Promise<{ token?: string; error?: string }> {
  const me = await requireOwner();
  if (!plaidConfigured()) return { error: "Plaid isn't set up yet: add PLAID_CLIENT_ID and PLAID_SECRET in Vercel (steps on this page)." };
  try {
    let access: string | undefined;
    if (reconnectId) {
      const conn = await db.bankConnection.findUnique({ where: { id: reconnectId } });
      access = decrypt(conn?.accessToken) ?? undefined;
      if (!access) return { error: "That bank connection can't be read. Disconnect it and connect again." };
    }
    return { token: await createLinkToken(me.id, access) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Plaid finished: keep the (encrypted) access and bring in the accounts and history. */
export async function connectBankAction(publicToken: string, institutionName: string | null): Promise<Result> {
  await requireOwner();
  try {
    const { accessToken, itemId } = await exchangePublicToken(publicToken);
    const conn = await db.bankConnection.upsert({
      where: { plaidItemId: itemId },
      update: { accessToken: encrypt(accessToken), institutionName, needsReconnect: false, lastError: null },
      create: { plaidItemId: itemId, accessToken: encrypt(accessToken), institutionName },
    });
    const r = await syncBank(conn.id);
    revalidatePath("/cash");
    return r.ok ? { ok: true, message: `Connected. ${r.message}` } : { ok: false, error: r.message };
  } catch (err) {
    return fail(err);
  }
}

/** After logging in to the bank again (Plaid's update mode), sync straight away. */
export async function reconnectedBankAction(connectionId: string): Promise<Result> {
  await requireOwner();
  await db.bankConnection.update({ where: { id: connectionId }, data: { needsReconnect: false, lastError: null } });
  const r = await syncBank(connectionId);
  revalidatePath("/cash");
  return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
}

/** "Refresh": Shopify payouts first, then the bank, so new deposits find their payout. */
export async function refreshCashAction(): Promise<Result> {
  await requireOwner();
  try {
    const stores = await db.store.findMany({ where: { shopifyDomain: { not: null } }, select: { id: true } });
    for (const s of stores) await syncPayouts(await getStoreConfig(s.id));
    const banks = await syncAllBanks();
    await matchPayouts();
    revalidatePath("/cash");
    const bad = banks.find((b) => !b.ok);
    return bad ? { ok: false, error: bad.message } : { ok: true, message: banks.length ? banks.map((b) => b.message).join(" · ") : "Shopify payouts updated." };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Sorts one bank line. With `always`, a rule is saved for lines named like it (same direction),
 * and every line the owner hasn't sorted by hand follows it, now and in future syncs.
 */
export async function setCategoryAction(txId: string, category: string, storeId: string | null, always: boolean): Promise<Result> {
  await requireOwner();
  if (!isCategory(category)) return { ok: false, error: "Unknown category" };
  const tx = await db.bankTransaction.findUnique({ where: { id: txId } });
  if (!tx) return { ok: false, error: "That transaction is gone. Refresh the page." };
  const store = storeId ? await db.store.findUnique({ where: { id: storeId }, select: { id: true } }) : null;
  await db.bankTransaction.update({ where: { id: txId }, data: { category, storeId: store?.id ?? null, categorySource: "you" } });
  let changed = 0;
  if (always) {
    const match = ruleMatchFor(tx);
    const direction = tx.amount > 0 ? "in" : "out";
    await db.cashRule.upsert({
      where: { match_direction: { match, direction } },
      update: { category, storeId: store?.id ?? null },
      create: { match, direction, category, storeId: store?.id ?? null },
    });
    const rules = await db.cashRule.findMany();
    const others = await db.bankTransaction.findMany({ where: { categorySource: { not: "you" }, id: { not: txId }, amount: direction === "in" ? { gt: 0 } : { lte: 0 } } });
    for (const o of others) {
      if (!matchText(o).includes(match)) continue;
      const c = categorize(o, rules);
      await db.bankTransaction.update({ where: { id: o.id }, data: { category: c.category, categorySource: c.source, storeId: o.payoutId ? o.storeId : (c.storeId ?? o.storeId) } });
      changed++;
    }
  }
  if (category === "SHOPIFY_PAYOUT") await matchPayouts();
  revalidatePath("/cash");
  return { ok: true, message: always ? `Saved. ${changed} other line${changed === 1 ? "" : "s"} named like it ${changed === 1 ? "was" : "were"} sorted the same way.` : "Saved." };
}

export async function deleteRuleAction(ruleId: string): Promise<Result> {
  await requireOwner();
  await db.cashRule.delete({ where: { id: ruleId } }).catch(() => null);
  revalidatePath("/cash");
  return { ok: true };
}

/** Whether a bank account counts on the Cash page (e.g. leave out a personal savings account). */
export async function setAccountIncludedAction(accountId: string, included: boolean): Promise<Result> {
  await requireOwner();
  await db.bankAccount.update({ where: { id: accountId }, data: { included } });
  revalidatePath("/cash");
  return { ok: true };
}

/** Stops reading this bank (Plaid is told too) and forgets its transactions. */
export async function disconnectBankAction(connectionId: string): Promise<Result> {
  await requireOwner();
  const conn = await db.bankConnection.findUnique({ where: { id: connectionId } });
  if (!conn) return { ok: true };
  const token = decrypt(conn.accessToken);
  if (token) await removeItem(token).catch(() => null); // already removed at Plaid is fine
  await db.bankConnection.delete({ where: { id: connectionId } });
  revalidatePath("/cash");
  return { ok: true, message: "Disconnected." };
}

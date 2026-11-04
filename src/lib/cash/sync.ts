import "server-only";
import { addDays } from "date-fns";
import { db } from "../db";
import { decrypt } from "../crypto";
import { categorize, type RuleLike } from "./categorize";
import { getAccounts, PlaidError, plaidConfigured, syncTransactions, type PlaidTransaction } from "./plaid";

export type BankSyncResult = { ok: boolean; message: string; added: number };

/** Plaid errors that only the owner can fix, by logging in to the bank again. */
const RECONNECT = new Set(["ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "ITEM_LOCKED", "INVALID_CREDENTIALS", "USER_SETUP_REQUIRED", "ACCESS_NOT_GRANTED"]);

const calendarDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function rowFor(t: PlaidTransaction, accountId: string) {
  return {
    accountId,
    date: calendarDay(t.date),
    amount: -t.amount, // Plaid: positive = money out. Here: positive = money in.
    name: t.name,
    merchantName: t.merchant_name ?? null,
    pending: t.pending,
    plaidCategory: t.personal_finance_category?.detailed ?? null,
  };
}

/** Brings one bank login up to date: balances, new and changed transactions, removals. */
export async function syncBank(connectionId: string): Promise<BankSyncResult> {
  const conn = await db.bankConnection.findUniqueOrThrow({ where: { id: connectionId } });
  const token = decrypt(conn.accessToken);
  const bank = conn.institutionName ?? "Bank";
  if (!token) return { ok: false, message: `${bank}: the saved connection can't be read. Connect the bank again.`, added: 0 };
  try {
    const accounts = await getAccounts(token);
    const now = new Date();
    for (const a of accounts) {
      const data = {
        name: a.official_name || a.name,
        mask: a.mask ?? null,
        type: a.type ?? null,
        subtype: a.subtype ?? null,
        currentBalance: a.balances.current,
        availableBalance: a.balances.available,
        balanceAt: now,
      };
      await db.bankAccount.upsert({ where: { plaidAccountId: a.account_id }, update: data, create: { ...data, plaidAccountId: a.account_id, connectionId } });
    }
    const accountIds = new Map((await db.bankAccount.findMany({ where: { connectionId }, select: { id: true, plaidAccountId: true } })).map((a) => [a.plaidAccountId, a.id]));

    const changes = await syncTransactions(token, conn.cursor);
    const rules: RuleLike[] = await db.cashRule.findMany();
    let added = 0;
    // Everything this pull touches that is already stored, read in one go.
    const ids = [...changes.modified.map((t) => t.transaction_id), ...changes.added.flatMap((t) => [t.transaction_id, t.pending_transaction_id ?? ""])].filter(Boolean);
    const known = new Map((await db.bankTransaction.findMany({ where: { plaidId: { in: ids } } })).map((t) => [t.plaidId, t]));

    // Changed lines keep the owner's own category; only automatic ones are sorted again.
    for (const t of changes.modified) {
      const accountId = accountIds.get(t.account_id);
      const existing = known.get(t.transaction_id);
      if (!accountId || !existing) continue;
      const row = rowFor(t, accountId);
      // The owner's own choice, and a deposit already matched to its Shopify payout, stay as they are.
      const sorted = existing.categorySource === "you" || existing.payoutId ? null : categorize(row, rules);
      await db.bankTransaction.update({
        where: { id: existing.id },
        data: { ...row, ...(sorted ? { category: sorted.category, categorySource: sorted.source, storeId: existing.storeId ?? sorted.storeId } : {}) },
      });
    }

    for (const t of changes.added) {
      const accountId = accountIds.get(t.account_id);
      if (!accountId) continue;
      const row = rowFor(t, accountId);
      // A charge that was pending and is now final carries over what the owner chose for it.
      const before = t.pending_transaction_id ? known.get(t.pending_transaction_id) : null;
      const kept = before && before.categorySource !== "auto" ? { category: before.category, categorySource: before.categorySource, storeId: before.storeId, note: before.note } : null;
      const sorted = kept ?? (() => {
        const c = categorize(row, rules);
        return { category: c.category, categorySource: c.source, storeId: c.storeId };
      })();
      await db.bankTransaction.upsert({
        where: { plaidId: t.transaction_id },
        update: row,
        create: { ...row, ...sorted, plaidId: t.transaction_id },
      });
      added++;
    }

    const removed = changes.removed.map((r) => r.transaction_id);
    if (removed.length) await db.bankTransaction.deleteMany({ where: { plaidId: { in: removed } } });

    await db.bankConnection.update({
      where: { id: connectionId },
      data: { cursor: changes.next_cursor || conn.cursor, historyStatus: changes.transactions_update_status ?? conn.historyStatus, lastSyncAt: now, lastError: null, needsReconnect: false },
    });
    await matchTransfers();
    await matchPayouts();
    return { ok: true, message: `${bank}: ${accounts.length} account${accounts.length === 1 ? "" : "s"}, ${added} new or updated transactions, ${removed.length} removed`, added };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reconnect = err instanceof PlaidError && RECONNECT.has(err.code);
    await db.bankConnection.update({ where: { id: connectionId }, data: { lastError: message.slice(0, 300), needsReconnect: reconnect, lastSyncAt: new Date() } });
    return { ok: false, message: `${bank}: ${message}`, added: 0 };
  }
}

/** Every connected bank. Skipped quietly when Plaid isn't set up. */
export async function syncAllBanks(): Promise<BankSyncResult[]> {
  if (!plaidConfigured()) return [];
  const conns = await db.bankConnection.findMany({ select: { id: true } });
  const out: BankSyncResult[] = [];
  for (const c of conns) out.push(await syncBank(c.id));
  return out;
}

/** Plaid's own word that a line moved money between accounts. */
const isTransferHint = (pc: string | null) => Boolean(pc && /^TRANSFER_(IN|OUT)_ACCOUNT_TRANSFER$/.test(pc));

/**
 * "Between your own accounts" only when the other half is there: the same amount the other way in
 * another counted account within 3 days (savings → checking). A transfer Plaid saw with no other half
 * came from or went to somewhere else (often a Shopify payout described without the word "Shopify"),
 * so it waits for the owner instead of being hidden as a transfer. Only automatic choices change.
 */
export async function matchTransfers(): Promise<number> {
  const lines = await db.bankTransaction.findMany({
    where: { pending: false, payoutId: null, categorySource: "auto", category: { in: ["TRANSFER", "UNSORTED"] }, account: { included: true } },
    select: { id: true, accountId: true, amount: true, date: true, plaidCategory: true, category: true },
    orderBy: { date: "asc" },
  });
  const hinted = lines.filter((l) => isTransferHint(l.plaidCategory));
  const paired = new Set<string>();
  for (const a of hinted) {
    if (paired.has(a.id) || a.amount <= 0) continue;
    const b = hinted
      .filter((x) => !paired.has(x.id) && x.accountId !== a.accountId && Math.abs(x.amount + a.amount) < 0.005 && Math.abs(x.date.getTime() - a.date.getTime()) <= 3 * 864e5)
      .sort((x, y) => Math.abs(x.date.getTime() - a.date.getTime()) - Math.abs(y.date.getTime() - a.date.getTime()))[0];
    if (!b) continue;
    paired.add(a.id);
    paired.add(b.id);
  }
  let changed = 0;
  for (const l of hinted) {
    const want = paired.has(l.id) ? "TRANSFER" : "UNSORTED";
    if (l.category === want) continue;
    await db.bankTransaction.update({ where: { id: l.id }, data: { category: want } });
    changed++;
  }
  return changed;
}

/**
 * Ties deposits in the bank to the Shopify payouts that caused them (same amount to the cent,
 * reaching the bank on the payout day or up to 5 days later), which also tells which store the
 * money came from. Works whatever the bank calls the deposit: besides lines already sorted as
 * payouts, any money in that is still unsorted and was sorted automatically is a candidate.
 * Each payout is used once; the closest date wins.
 */
export async function matchPayouts(): Promise<number> {
  const txs = await db.bankTransaction.findMany({
    where: {
      payoutId: null,
      pending: false,
      amount: { gt: 0 },
      account: { included: true },
      OR: [{ category: "SHOPIFY_PAYOUT" }, { category: "UNSORTED", categorySource: "auto" }],
    },
    orderBy: { date: "asc" },
  });
  if (txs.length === 0) return 0;
  const from = addDays(txs[0].date, -6);
  const payouts = await db.shopifyPayout.findMany({ where: { status: "PAID", bankTransaction: null, issuedAt: { gte: from } }, orderBy: { issuedAt: "asc" } });
  const used = new Set<string>();
  let matched = 0;
  // Lines already called payouts get first pick of the payouts.
  for (const tx of [...txs].sort((a, b) => Number(b.category === "SHOPIFY_PAYOUT") - Number(a.category === "SHOPIFY_PAYOUT"))) {
    const day = tx.date.getTime();
    const best = payouts
      .filter((p) => !used.has(p.id) && Math.abs(p.net - tx.amount) < 0.005)
      .map((p) => ({ p, lag: day - Date.UTC(p.issuedAt.getUTCFullYear(), p.issuedAt.getUTCMonth(), p.issuedAt.getUTCDate()) }))
      .filter((c) => c.lag >= -864e5 && c.lag <= 5 * 864e5)
      .sort((a, b) => Math.abs(a.lag) - Math.abs(b.lag))[0];
    if (!best) continue;
    used.add(best.p.id);
    await db.bankTransaction.update({
      where: { id: tx.id },
      data: { payoutId: best.p.id, storeId: tx.storeId ?? best.p.storeId, ...(tx.categorySource === "auto" ? { category: "SHOPIFY_PAYOUT" } : {}) },
    });
    matched++;
  }
  return matched;
}

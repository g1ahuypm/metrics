import "server-only";

/**
 * The few Plaid API calls the Cash page needs, over plain HTTPS.
 * Keys live in Vercel: PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV ("production" or "sandbox").
 * PLAID_BASE_URL overrides the address (used for testing against a stand-in).
 */

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID?.trim() && process.env.PLAID_SECRET?.trim());
}

function baseUrl(): string {
  const override = process.env.PLAID_BASE_URL?.trim();
  if (override) return override.replace(/\/$/, "");
  return process.env.PLAID_ENV?.trim() === "sandbox" ? "https://sandbox.plaid.com" : "https://production.plaid.com";
}

/** A Plaid error, with the code Plaid gives (ITEM_LOGIN_REQUIRED, …). */
export class PlaidError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: process.env.PLAID_CLIENT_ID?.trim(), secret: process.env.PLAID_SECRET?.trim(), ...body }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(data.error_code ?? `HTTP_${res.status}`);
    const msg = String(data.display_message ?? data.error_message ?? `Plaid answered ${res.status}`);
    throw new PlaidError(msg, code);
  }
  return data as T;
}

/** Starts Plaid Link in the browser. With an access token, Link reconnects that bank instead. */
export async function createLinkToken(userId: string, accessToken?: string): Promise<string> {
  const r = await call<{ link_token: string }>("/link/token/create", {
    client_name: "Margin",
    user: { client_user_id: userId },
    country_codes: ["US"],
    language: "en",
    ...(accessToken ? { access_token: accessToken } : { products: ["transactions"], transactions: { days_requested: 730 } }),
  });
  return r.link_token;
}

export async function exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
  const r = await call<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: publicToken });
  return { accessToken: r.access_token, itemId: r.item_id };
}

export type PlaidAccount = {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
  balances: { current: number | null; available: number | null; iso_currency_code?: string | null };
};

export async function getAccounts(accessToken: string): Promise<PlaidAccount[]> {
  const r = await call<{ accounts: PlaidAccount[] }>("/accounts/get", { access_token: accessToken });
  return r.accounts;
}

export type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  amount: number; // positive = money out of the account
  date: string; // YYYY-MM-DD
  name: string;
  merchant_name?: string | null;
  pending: boolean;
  pending_transaction_id?: string | null; // set on a posted transaction that replaces a pending one
  personal_finance_category?: { primary?: string; detailed?: string } | null;
};

export type SyncPage = {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: { transaction_id: string }[];
  next_cursor: string;
  has_more: boolean;
  transactions_update_status?: string;
};

/**
 * Every change since `cursor`. Pages are collected first and applied together, and the
 * whole pull starts again if Plaid reports the data moved while paging (its documented rule).
 */
export async function syncTransactions(accessToken: string, cursor: string | null): Promise<Omit<SyncPage, "has_more">> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const out: Omit<SyncPage, "has_more"> = { added: [], modified: [], removed: [], next_cursor: cursor ?? "" };
    let next = cursor;
    try {
      for (let page = 0; page < 50; page++) {
        const r = await call<SyncPage>("/transactions/sync", { access_token: accessToken, count: 500, ...(next ? { cursor: next } : {}) });
        out.added.push(...r.added);
        out.modified.push(...r.modified);
        out.removed.push(...r.removed);
        out.next_cursor = r.next_cursor;
        out.transactions_update_status = r.transactions_update_status;
        next = r.next_cursor;
        if (!r.has_more) return out;
      }
      return out;
    } catch (err) {
      if (err instanceof PlaidError && err.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") continue;
      throw err;
    }
  }
  throw new PlaidError("The bank's data kept changing while it was read. It will be tried again on the next check.", "SYNC_RETRY");
}

export async function removeItem(accessToken: string): Promise<void> {
  await call("/item/remove", { access_token: accessToken });
}

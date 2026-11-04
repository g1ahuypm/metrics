import "server-only";
import { db } from "../db";
import { getShopifyToken, shopifyGraphQL } from "../integrations/shopify";
import type { StoreConfig } from "../integrations/config";

type Money = { amount: string; currencyCode: string };
type PayoutNode = {
  id: string;
  issuedAt: string;
  status: string;
  transactionType: string;
  net: Money;
  summary: {
    chargesGross: Money;
    chargesFee: Money;
    refundsFeeGross: Money;
    refundsFee: Money;
    adjustmentsGross: Money;
    adjustmentsFee: Money;
    reservedFundsFee: Money;
    retriedPayoutsFee: Money;
    advanceFees: Money;
  };
};

const QUERY = `query($after: String) {
  shopifyPaymentsAccount {
    balance { amount currencyCode }
    payouts(first: 50, reverse: true, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id issuedAt status transactionType net { amount currencyCode }
        summary {
          chargesGross { amount currencyCode } chargesFee { amount currencyCode }
          refundsFeeGross { amount currencyCode } refundsFee { amount currencyCode }
          adjustmentsGross { amount currencyCode } adjustmentsFee { amount currencyCode }
          reservedFundsFee { amount currencyCode } retriedPayoutsFee { amount currencyCode } advanceFees { amount currencyCode }
        }
      }
    }
  }
}`;

export const PAYOUT_SCOPES_NOTE =
  "Shopify payouts need two more permissions on this store's Shopify app: read_shopify_payments_accounts and read_shopify_payments_payouts.";

const num = (m: Money | undefined) => Number(m?.amount ?? 0);

type Page = { shopifyPaymentsAccount: { balance: Money[]; payouts: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: PayoutNode[] } } | null };

const denied = (msg: string) => /access denied|scope|denied access/i.test(msg);
const FINAL = new Set(["PAID", "FAILED", "CANCELED"]);
const MAX_PAGES = 12; // 600 payouts
const HISTORY_MS = 450 * 864e5; // as far back as the bank history can go

/**
 * The store's Shopify Payments balance and its payouts, newest first, paging back until it
 * reaches payouts already stored (and settled) or about 15 months. Never fails the order sync:
 * without the payout permissions (or without Shopify Payments) it notes why and moves on.
 * Permissions added in Shopify only reach a new access key, so a refusal is retried once with one.
 */
export async function syncPayouts(cfg: StoreConfig): Promise<number> {
  if (!cfg.shopify) return 0;
  const auth = cfg.shopify;
  const fetchPage = async (after: string | null): Promise<Page> => {
    try {
      return await shopifyGraphQL<Page>(auth, QUERY, { after });
    } catch (err) {
      if (!denied(err instanceof Error ? err.message : String(err))) throw err;
      await getShopifyToken(auth, true);
      return shopifyGraphQL<Page>(auth, QUERY, { after });
    }
  };

  let first: Page;
  try {
    first = await fetchPage(null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const note = denied(msg) ? PAYOUT_SCOPES_NOTE : `Payouts could not be read: ${msg}`.slice(0, 300);
    await db.store.update({ where: { id: cfg.storeId }, data: { shopifyPayoutsNote: note } });
    return 0;
  }
  const account = first.shopifyPaymentsAccount;
  if (!account) {
    await db.store.update({ where: { id: cfg.storeId }, data: { shopifyPayoutsNote: "This store doesn't use Shopify Payments, so there are no payouts to show." } });
    return 0;
  }

  const known = new Map((await db.shopifyPayout.findMany({ where: { storeId: cfg.storeId }, select: { id: true, status: true } })).map((p) => [p.id, p.status]));
  let page: Page["shopifyPaymentsAccount"] = account;
  let saved = 0;
  for (let n = 0; page && n < MAX_PAGES; n++) {
    const nodes = page.payouts.nodes;
    for (const p of nodes) {
      const s = p.summary;
      const data = {
        storeId: cfg.storeId,
        issuedAt: new Date(p.issuedAt),
        status: p.status,
        transactionType: p.transactionType,
        // A withdrawal takes money back from the bank.
        net: p.transactionType === "WITHDRAWAL" ? -Math.abs(num(p.net)) : num(p.net),
        salesGross: num(s.chargesGross),
        fees: num(s.chargesFee) + num(s.refundsFee) + num(s.adjustmentsFee) + num(s.reservedFundsFee) + num(s.retriedPayoutsFee) + num(s.advanceFees),
        refunds: num(s.refundsFeeGross),
        adjustments: num(s.adjustmentsGross),
        currency: p.net.currencyCode,
      };
      await db.shopifyPayout.upsert({ where: { id: p.id }, update: data, create: { id: p.id, ...data } });
      saved++;
    }
    // Stop at history already stored and settled, or once far enough back.
    const reachedKnown = nodes.length > 0 && nodes.every((p) => FINAL.has(p.status) && known.get(p.id) === p.status);
    const oldest = nodes.at(-1);
    const farEnough = oldest ? Date.now() - new Date(oldest.issuedAt).getTime() > HISTORY_MS : true;
    if (reachedKnown || farEnough || !page.payouts.pageInfo.hasNextPage) break;
    page = (await fetchPage(page.payouts.pageInfo.endCursor)).shopifyPaymentsAccount;
  }
  const balance = account.balance.reduce((sum, m) => sum + num(m), 0);
  await db.store.update({ where: { id: cfg.storeId }, data: { shopifyBalance: balance, shopifyBalanceAt: new Date(), shopifyPayoutsNote: null } });
  return saved;
}

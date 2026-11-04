import "server-only";
import { db } from "../db";
import { shopifyGraphQL } from "../integrations/shopify";
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

const QUERY = `{
  shopifyPaymentsAccount {
    balance { amount currencyCode }
    payouts(first: 50, reverse: true) {
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

/**
 * The store's Shopify Payments balance and its last 50 payouts. Never fails the order sync:
 * without the payout permissions (or without Shopify Payments) it notes why and moves on.
 */
export async function syncPayouts(cfg: StoreConfig): Promise<number> {
  if (!cfg.shopify) return 0;
  let data: { shopifyPaymentsAccount: { balance: Money[]; payouts: { nodes: PayoutNode[] } } | null };
  try {
    data = await shopifyGraphQL(cfg.shopify, QUERY);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const note = /access denied|scope|denied access/i.test(msg) ? PAYOUT_SCOPES_NOTE : `Payouts could not be read: ${msg}`.slice(0, 300);
    await db.store.update({ where: { id: cfg.storeId }, data: { shopifyPayoutsNote: note } });
    return 0;
  }
  const account = data.shopifyPaymentsAccount;
  if (!account) {
    await db.store.update({ where: { id: cfg.storeId }, data: { shopifyPayoutsNote: "This store doesn't use Shopify Payments, so there are no payouts to show." } });
    return 0;
  }
  const balance = account.balance.reduce((s, m) => s + num(m), 0);
  for (const p of account.payouts.nodes) {
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
  }
  await db.store.update({ where: { id: cfg.storeId }, data: { shopifyBalance: balance, shopifyBalanceAt: new Date(), shopifyPayoutsNote: null } });
  return account.payouts.nodes.length;
}

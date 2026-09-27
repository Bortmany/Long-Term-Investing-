// Holdings and cash balances, derived purely from transactions.
// Cash is NEVER stored — it is always computed here:
//   cash = deposits − withdrawals − buys + sells + dividends − fees

import type { Currency } from "@prisma/client";
import type { TxnInput } from "./types";

const EPSILON = 1e-9;

export type Holding = {
  instrumentId: string;
  /** Units currently held (buys − sells). */
  quantity: number;
  /** Remaining cost basis (average-cost method, includes buy fees), in `currency`. */
  costBasis: number;
  /** Currency the instrument was traded in. */
  currency: Currency;
  /** costBasis / quantity; null when quantity is 0. */
  avgCostPerUnit: number | null;
};

/**
 * Current holdings per instrument using the average-cost method.
 * Transactions are processed in tradeDate order. Positions that are fully
 * sold (quantity ≈ 0) are omitted.
 */
export function computeHoldings(transactions: TxnInput[]): Holding[] {
  const byInstrument = new Map<
    string,
    { quantity: number; costBasis: number; currency: Currency }
  >();

  // Deterministic order: by trade date, then a STABLE tie-break so two
  // transactions on the same day always process in the same sequence no
  // matter what order the database handed them to us. Without this, the
  // Dashboard and Portfolio pages (which queried in different orders) could
  // compute different average costs and show different totals — a silent
  // golden-rule violation. Real rows always have createdAt + id (filled by
  // fromPrismaTransaction); pure-fixture rows without them fall back to the
  // input order, which is deterministic within a single test.
  const sorted = [...transactions].sort((a, b) => {
    const byDate = a.tradeDate.getTime() - b.tradeDate.getTime();
    if (byDate !== 0) return byDate;
    if (a.createdAt && b.createdAt) {
      const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
      if (byCreated !== 0) return byCreated;
    }
    if (a.id && b.id) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return 0;
  });

  for (const txn of sorted) {
    if (!txn.instrumentId) continue;
    if (txn.type !== "BUY" && txn.type !== "SELL") continue;
    const quantity = txn.quantity ?? 0;
    if (quantity <= 0) continue;

    const position = byInstrument.get(txn.instrumentId) ?? {
      quantity: 0,
      costBasis: 0,
      currency: txn.currency,
    };

    if (txn.type === "BUY") {
      position.quantity += quantity;
      position.costBasis += txn.amount + txn.fee;
      position.currency = txn.currency;
    } else {
      // SELL: release cost basis proportionally (average cost).
      const avgCost =
        position.quantity > EPSILON ? position.costBasis / position.quantity : 0;
      const sold = Math.min(quantity, position.quantity);
      position.quantity -= sold;
      position.costBasis -= avgCost * sold;
    }

    byInstrument.set(txn.instrumentId, position);
  }

  const holdings: Holding[] = [];
  for (const [instrumentId, position] of byInstrument) {
    if (position.quantity <= EPSILON) continue;
    holdings.push({
      instrumentId,
      quantity: position.quantity,
      costBasis: position.costBasis,
      currency: position.currency,
      avgCostPerUnit:
        position.quantity > EPSILON
          ? position.costBasis / position.quantity
          : null,
    });
  }
  return holdings;
}

export type CashBalance = {
  currency: Currency;
  /** Derived from transactions — see formula at the top of this file. */
  amount: number;
};

/**
 * Cash balance per currency, derived from transactions:
 * deposits − withdrawals − buys + sells + dividends − fees.
 */
export function computeCashBalances(transactions: TxnInput[]): CashBalance[] {
  const byCurrency = new Map<Currency, number>();

  for (const txn of transactions) {
    let delta = 0;
    switch (txn.type) {
      case "DEPOSIT":
        delta = txn.amount;
        break;
      case "WITHDRAWAL":
        delta = -txn.amount;
        break;
      case "BUY":
        delta = -txn.amount;
        break;
      case "SELL":
        delta = txn.amount;
        break;
      case "DIVIDEND":
        delta = txn.amount;
        break;
      case "FEE":
        delta = -txn.amount;
        break;
    }
    // Per-transaction fee always reduces cash (broker commission etc.).
    delta -= txn.fee;

    byCurrency.set(txn.currency, (byCurrency.get(txn.currency) ?? 0) + delta);
  }

  return [...byCurrency.entries()].map(([currency, amount]) => ({
    currency,
    amount,
  }));
}

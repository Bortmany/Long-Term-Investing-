// Money-weighted total return, derived from the user's own transactions.
//
// Definition (kept deliberately simple, per the Phase 2 spec):
//   return (with dividends)    = current value + dividends − net contributions
//   return (without dividends) = current value − net contributions
//   percent base               = net contributions (deposits − withdrawals)
//
// GOLDEN RULE: amounts that cannot be converted to the base currency are
// reported in `missing` and excluded — never converted silently at 1.0.
// An empty portfolio returns 0 absolute / 0 percent (typed zeros, never NaN).

import type { Currency } from "@prisma/client";
import { convertAmount } from "./fx";
import type { FxRateInput, TxnInput } from "./types";

export type ReturnFigure = {
  /** Signed money amount in the base currency. */
  absolute: number;
  /** Signed percentage (e.g. 9.4 means +9.4%), measured against net contributions. */
  percent: number;
};

export type PortfolioReturns = {
  baseCurrency: Currency;
  /** Deposits − withdrawals, converted to base currency (convertible part only). */
  netContributions: number;
  /** Dividends received net of withholding, converted to base currency. */
  dividends: number;
  /** The current portfolio value the caller passed in. */
  currentValue: number;
  withDividends: ReturnFigure;
  withoutDividends: ReturnFigure;
  /** False when any amount could not be converted — the UI must say so. */
  complete: boolean;
  missing: {
    kind: "contribution" | "dividend";
    currency: Currency;
    amount: number;
    tradeDate: Date;
  }[];
};

/**
 * Compute the portfolio's money-weighted total return.
 * `currentValue` must already be in the base currency (use
 * `computePortfolioValue(...).totalValue`).
 */
export function computeReturns(input: {
  transactions: TxnInput[];
  /** Current portfolio value in the base currency. */
  currentValue: number;
  baseCurrency: Currency;
  fxRates: FxRateInput[];
}): PortfolioReturns {
  const { transactions, currentValue, baseCurrency, fxRates } = input;

  let netContributions = 0;
  let dividends = 0;
  const missing: PortfolioReturns["missing"] = [];

  for (const txn of transactions) {
    if (txn.type === "DEPOSIT" || txn.type === "WITHDRAWAL") {
      const signed = txn.type === "DEPOSIT" ? txn.amount : -txn.amount;
      const converted = convertAmount(signed, txn.currency, baseCurrency, fxRates);
      if (converted.ok) {
        netContributions += converted.value;
      } else {
        missing.push({
          kind: "contribution",
          currency: txn.currency,
          amount: signed,
          tradeDate: txn.tradeDate,
        });
      }
    } else if (txn.type === "DIVIDEND") {
      const net = txn.amount - txn.fee;
      const converted = convertAmount(net, txn.currency, baseCurrency, fxRates);
      if (converted.ok) {
        dividends += converted.value;
      } else {
        missing.push({
          kind: "dividend",
          currency: txn.currency,
          amount: net,
          tradeDate: txn.tradeDate,
        });
      }
    }
  }

  // Percent base is net contributions; guard against divide-by-zero (a
  // portfolio funded entirely by... nothing) with typed zeros, never NaN.
  const percentOf = (absolute: number): number =>
    netContributions > 0 ? (absolute / netContributions) * 100 : 0;

  const withDividendsAbs = currentValue + dividends - netContributions;
  const withoutDividendsAbs = currentValue - netContributions;

  // Truly empty portfolio: nothing contributed, nothing held — report zeros.
  const isEmpty =
    transactions.length === 0 && currentValue === 0;

  return {
    baseCurrency,
    netContributions,
    dividends,
    currentValue,
    withDividends: isEmpty
      ? { absolute: 0, percent: 0 }
      : { absolute: withDividendsAbs, percent: percentOf(withDividendsAbs) },
    withoutDividends: isEmpty
      ? { absolute: 0, percent: 0 }
      : { absolute: withoutDividendsAbs, percent: percentOf(withoutDividendsAbs) },
    complete: missing.length === 0,
    missing,
  };
}

// Trailing dividend income, derived from DIVIDEND transactions.
// Amounts that cannot be converted to the base currency are reported in
// `missing`, never silently converted at 1.0 (golden rule).

import type { Currency } from "@prisma/client";
import { convertAmount } from "./fx";
import type { FxRateInput, TxnInput } from "./types";

export type DividendIncome = {
  baseCurrency: Currency;
  /** Total dividend income in base currency over the window (convertible part). */
  total: number;
  /** Number of dividend transactions included in `total`. */
  count: number;
  /** Window boundaries (inclusive). */
  from: Date;
  to: Date;
  complete: boolean;
  /** Dividends left out because no FX rate was available. */
  missing: { currency: Currency; amount: number; tradeDate: Date }[];
};

/**
 * Sum of DIVIDEND transactions in the trailing window (default 12 months),
 * converted to `baseCurrency` via the given FX rates.
 */
export function computeTrailingDividendIncome(
  transactions: TxnInput[],
  options: {
    baseCurrency: Currency;
    fxRates: FxRateInput[];
    now?: Date;
    months?: number;
  },
): DividendIncome {
  const { baseCurrency, fxRates } = options;
  const to = options.now ?? new Date();
  const months = options.months ?? 12;
  const from = new Date(to);
  from.setMonth(from.getMonth() - months);

  let total = 0;
  let count = 0;
  const missing: DividendIncome["missing"] = [];

  for (const txn of transactions) {
    if (txn.type !== "DIVIDEND") continue;
    if (txn.tradeDate < from || txn.tradeDate > to) continue;

    const net = txn.amount - txn.fee;
    const converted = convertAmount(net, txn.currency, baseCurrency, fxRates);
    if (converted.ok) {
      total += converted.value;
      count += 1;
    } else {
      missing.push({
        currency: txn.currency,
        amount: net,
        tradeDate: txn.tradeDate,
      });
    }
  }

  return {
    baseCurrency,
    total,
    count,
    from,
    to,
    complete: missing.length === 0,
    missing,
  };
}

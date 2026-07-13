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

// ---------------------------------------------------------------------------
// Monthly dividend buckets (the T12M bar chart) and income by holding.
// Same golden-rule handling as above: unconvertible amounts land in
// `missing`, never in a bar.
// ---------------------------------------------------------------------------

export type MonthlyDividendBucket = {
  /** Calendar year of this bucket, e.g. 2026. */
  year: number;
  /** Calendar month, 1–12. */
  month: number;
  /** Short label for the chart x-axis, e.g. "Jul". */
  label: string;
  /** Dividend income (net of withholding) in base currency for this month. */
  total: number;
};

export type MonthlyDividends = {
  baseCurrency: Currency;
  /** Exactly `months` buckets, oldest first, newest (current month) last. */
  buckets: MonthlyDividendBucket[];
  complete: boolean;
  missing: DividendIncome["missing"];
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * Dividend income per trailing calendar month (default 12 — the T12M chart).
 * Buckets are calendar months; the last bucket is the month `now` falls in.
 * Months with no dividends stay in the list with total 0 (a real zero —
 * "nothing was received" is a fact, not a fabrication).
 */
export function computeMonthlyDividends(
  transactions: TxnInput[],
  options: {
    baseCurrency: Currency;
    fxRates: FxRateInput[];
    now?: Date;
    months?: number;
  },
): MonthlyDividends {
  const { baseCurrency, fxRates } = options;
  const now = options.now ?? new Date();
  const months = options.months ?? 12;

  // Build the empty buckets first, oldest → newest.
  const buckets: MonthlyDividendBucket[] = [];
  const keyToIndex = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    keyToIndex.set(`${year}-${month}`, buckets.length);
    buckets.push({ year, month, label: MONTH_LABELS[month - 1], total: 0 });
  }

  const missing: DividendIncome["missing"] = [];
  for (const txn of transactions) {
    if (txn.type !== "DIVIDEND") continue;
    const key = `${txn.tradeDate.getFullYear()}-${txn.tradeDate.getMonth() + 1}`;
    const index = keyToIndex.get(key);
    if (index === undefined) continue; // outside the window

    const net = txn.amount - txn.fee;
    const converted = convertAmount(net, txn.currency, baseCurrency, fxRates);
    if (converted.ok) {
      buckets[index].total += converted.value;
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
    buckets,
    complete: missing.length === 0,
    missing,
  };
}

export type DividendsByHolding = {
  baseCurrency: Currency;
  /** One row per instrument that paid a dividend in the window, largest first. */
  rows: { instrumentId: string; total: number; count: number }[];
  from: Date;
  to: Date;
  complete: boolean;
  missing: DividendIncome["missing"];
};

/**
 * Trailing dividend income per instrument (default window 12 months),
 * for the "income by holding" list. Sorted by total, top payer first.
 */
export function computeDividendsByHolding(
  transactions: TxnInput[],
  options: {
    baseCurrency: Currency;
    fxRates: FxRateInput[];
    now?: Date;
    months?: number;
  },
): DividendsByHolding {
  const { baseCurrency, fxRates } = options;
  const to = options.now ?? new Date();
  const months = options.months ?? 12;
  const from = new Date(to);
  from.setMonth(from.getMonth() - months);

  const byInstrument = new Map<string, { total: number; count: number }>();
  const missing: DividendIncome["missing"] = [];

  for (const txn of transactions) {
    if (txn.type !== "DIVIDEND") continue;
    if (txn.tradeDate < from || txn.tradeDate > to) continue;
    if (!txn.instrumentId) continue;

    const net = txn.amount - txn.fee;
    const converted = convertAmount(net, txn.currency, baseCurrency, fxRates);
    if (!converted.ok) {
      missing.push({
        currency: txn.currency,
        amount: net,
        tradeDate: txn.tradeDate,
      });
      continue;
    }
    const entry = byInstrument.get(txn.instrumentId) ?? { total: 0, count: 0 };
    entry.total += converted.value;
    entry.count += 1;
    byInstrument.set(txn.instrumentId, entry);
  }

  const rows = [...byInstrument.entries()]
    .map(([instrumentId, entry]) => ({ instrumentId, ...entry }))
    .sort((a, b) => b.total - a.total);

  return {
    baseCurrency,
    rows,
    from,
    to,
    complete: missing.length === 0,
    missing,
  };
}

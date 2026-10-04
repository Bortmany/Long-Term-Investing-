// Trailing dividend income, derived from DIVIDEND transactions.
// Amounts that cannot be converted to the base currency are reported in
// `missing`, never silently converted at 1.0 (golden rule).
//
// Rounding rule: each holding's dividend figure is rounded to the money's own
// precision (OMR 3 decimals, others 2) and the headline total is the sum of
// those ALREADY-ROUNDED figures — so the total on screen always equals the
// rows beneath it, to the last decimal.

import type { Currency } from "@prisma/client";
import { convertAmount } from "./fx";
import type { FxRateInput, TxnInput } from "./types";

/** One dividend that could not be converted to the base currency. */
export type MissingDividend = {
  currency: Currency;
  amount: number;
  tradeDate: Date;
  /** Which holding paid it, so the screen can name it. */
  instrumentId?: string;
};

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
  missing: MissingDividend[];
};

/**
 * Round to the money's own precision — OMR to 3 decimals (the baisa), every
 * other currency to 2 — the same precision the screen shows.
 */
export function roundMoney(amount: number, currency: Currency): number {
  const factor = currency === "OMR" ? 1000 : 100;
  // (toPrecision(12) keeps 12 significant digits, plenty for realistic dividend amounts.)
  // toPrecision first so a value like 1.0005 (really 1.000499999…) rounds
  // the way a person expects.
  return Math.round(Number((amount * factor).toPrecision(12))) / factor;
}

/** Build a "missing" entry (instrumentId only when the dividend has one). */
function missingEntry(txn: TxnInput, net: number): MissingDividend {
  const entry: MissingDividend = {
    currency: txn.currency,
    amount: net,
    tradeDate: txn.tradeDate,
  };
  if (txn.instrumentId) entry.instrumentId = txn.instrumentId;
  return entry;
}

/**
 * The ONE per-payment calculation: net of fee, converted to the base
 * currency. `baseAmount` is null when no exchange rate exists (never 1.0).
 * Income by Holding and the per-stock list both go through this, so they
 * cannot disagree.
 */
function convertDividendPayment(
  txn: TxnInput,
  baseCurrency: Currency,
  fxRates: FxRateInput[],
): { net: number; baseAmount: number | null } {
  const net = txn.amount - txn.fee;
  const converted = convertAmount(net, txn.currency, baseCurrency, fxRates);
  return { net, baseAmount: converted.ok ? converted.value : null };
}

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

  // Add up per holding first, round each holding's figure, THEN sum the
  // rounded figures — the headline equals the per-holding rows exactly.
  const perHolding = new Map<string, number>();
  let count = 0;
  const missing: MissingDividend[] = [];

  for (const txn of transactions) {
    if (txn.type !== "DIVIDEND") continue;
    if (txn.tradeDate < from || txn.tradeDate > to) continue;

    const net = txn.amount - txn.fee;
    const converted = convertAmount(net, txn.currency, baseCurrency, fxRates);
    if (converted.ok) {
      const key = txn.instrumentId ?? "";
      perHolding.set(key, (perHolding.get(key) ?? 0) + converted.value);
      count += 1;
    } else {
      missing.push(missingEntry(txn, net));
    }
  }

  let total = 0;
  for (const value of perHolding.values()) {
    total += roundMoney(value, baseCurrency);
  }
  total = roundMoney(total, baseCurrency);

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
  missing: MissingDividend[];
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

  const missing: MissingDividend[] = [];
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
      missing.push(missingEntry(txn, net));
    }
  }

  // Show each bar at the money's own precision.
  for (const bucket of buckets) {
    bucket.total = roundMoney(bucket.total, baseCurrency);
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
  missing: MissingDividend[];
};

/**
 * Trailing dividend income per instrument (default window 12 months),
 * for the "income by holding" list. Sorted by total, top payer first.
 * Each row's total is rounded once; the headline adds these same values.
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
  const missing: MissingDividend[] = [];

  for (const txn of transactions) {
    if (txn.type !== "DIVIDEND") continue;
    if (txn.tradeDate < from || txn.tradeDate > to) continue;
    if (!txn.instrumentId) continue;

    const payment = convertDividendPayment(txn, baseCurrency, fxRates);
    if (payment.baseAmount === null) {
      missing.push(missingEntry(txn, payment.net));
      continue;
    }
    const entry = byInstrument.get(txn.instrumentId) ?? { total: 0, count: 0 };
    entry.total += payment.baseAmount;
    entry.count += 1;
    byInstrument.set(txn.instrumentId, entry);
  }

  const rows = [...byInstrument.entries()]
    .map(([instrumentId, entry]) => ({
      instrumentId,
      total: roundMoney(entry.total, baseCurrency),
      count: entry.count,
    }))
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

// ---------------------------------------------------------------------------
// One stock's received dividends (the "Dividends you've received" block).
// ---------------------------------------------------------------------------

export type StockDividendPayment = {
  tradeDate: Date;
  /** The payment as recorded (net of fee), in its own currency. */
  currency: Currency;
  amount: number;
  /** Base-currency amount, rounded to the money's precision; null = no exchange rate. */
  baseAmount: number | null;
  /** True when the payment falls in the trailing window (counted in the total). */
  inWindow: boolean;
};

export type StockDividends = {
  baseCurrency: Currency;
  /** Every payment for this stock, newest first. Unconvertible ones are kept. */
  payments: StockDividendPayment[];
  /**
   * Trailing-window total, or null when no payment in the window could be
   * counted (an honest "none", never a zero figure). It is this stock's
   * Income by Holding row, from the same function.
   */
  trailing: { total: number; count: number; from: Date; to: Date } | null;
  complete: boolean;
  /** Payments left out of the total because no exchange rate was available. */
  missing: MissingDividend[];
};

/**
 * List ONE stock's DIVIDEND payments and its trailing total. The total comes
 * straight from computeDividendsByHolding, and each payment goes through the
 * same convertDividendPayment, so this can never disagree with the
 * dashboard's Income by Holding.
 *
 * Caller must pass only the signed-in user's own transactions.
 */
export function computeStockDividends(
  transactions: TxnInput[],
  options: {
    instrumentId: string;
    baseCurrency: Currency;
    fxRates: FxRateInput[];
    now?: Date;
    months?: number;
  },
): StockDividends {
  const { instrumentId, baseCurrency, fxRates } = options;
  const own = transactions.filter(
    (t) => t.type === "DIVIDEND" && t.instrumentId === instrumentId,
  );

  const byHolding = computeDividendsByHolding(own, options);
  const row = byHolding.rows.find((r) => r.instrumentId === instrumentId);

  const payments: StockDividendPayment[] = own
    .map((txn) => {
      const payment = convertDividendPayment(txn, baseCurrency, fxRates);
      return {
        tradeDate: txn.tradeDate,
        currency: txn.currency,
        amount: payment.net,
        baseAmount:
          payment.baseAmount === null
            ? null
            : roundMoney(payment.baseAmount, baseCurrency),
        inWindow: txn.tradeDate >= byHolding.from && txn.tradeDate <= byHolding.to,
      };
    })
    .sort((a, b) => b.tradeDate.getTime() - a.tradeDate.getTime());

  return {
    baseCurrency,
    payments,
    trailing: row
      ? { total: row.total, count: row.count, from: byHolding.from, to: byHolding.to }
      : null,
    complete: byHolding.complete,
    missing: byHolding.missing,
  };
}

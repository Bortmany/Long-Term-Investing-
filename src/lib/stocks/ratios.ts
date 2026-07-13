// Pure ratio-derivation functions for the stock detail page's ratio strip
// (ui-spec §4.2). No I/O and no database — every function takes plain parsed
// numbers (pulled from the financial statements + the latest quote) and
// returns either a finite number or `null`.
//
// GOLDEN RULE: never invent a figure. `null` is returned whenever a required
// input is missing OR the ratio would be meaningless (a negative/zero
// denominator, or P/E on non-positive earnings). A `null` becomes the spec's
// "—" + "Unavailable" tile in the UI, and — because each function is
// independent — one missing ratio never blanks the whole strip.

/** A value that may be absent (missing statement line) or present. */
export type MaybeNumber = number | null | undefined;

function isFiniteNumber(value: MaybeNumber): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositive(value: MaybeNumber): value is number {
  return isFiniteNumber(value) && value > 0;
}

/**
 * Price / Earnings. Meaningless (→ null) when earnings per share are missing
 * or non-positive — a negative or zero-earnings P/E is not an honest figure.
 */
export function priceToEarnings(
  price: MaybeNumber,
  earningsPerShare: MaybeNumber,
): number | null {
  if (!isPositive(price)) return null;
  if (!isPositive(earningsPerShare)) return null;
  return price / earningsPerShare;
}

/**
 * Price / Book (per share). Null when book value per share is missing or
 * non-positive (a negative equity book value can't produce an honest P/B).
 */
export function priceToBook(
  price: MaybeNumber,
  bookValuePerShare: MaybeNumber,
): number | null {
  if (!isPositive(price)) return null;
  if (!isPositive(bookValuePerShare)) return null;
  return price / bookValuePerShare;
}

/**
 * Dividend yield as a percentage: annual dividend per share ÷ price × 100.
 * A genuine zero (a company that pays no dividend, dividend-per-share = 0)
 * yields 0%. Null only when the dividend-per-share is unknown or the price is
 * unavailable/non-positive.
 */
export function dividendYield(
  annualDividendPerShare: MaybeNumber,
  price: MaybeNumber,
): number | null {
  if (!isPositive(price)) return null;
  if (!isFiniteNumber(annualDividendPerShare) || annualDividendPerShare < 0) {
    return null;
  }
  return (annualDividendPerShare / price) * 100;
}

/**
 * Debt / Equity. Null when equity is missing or non-positive (a negative
 * equity denominator makes the ratio meaningless) or debt is unknown.
 */
export function debtToEquity(
  totalDebt: MaybeNumber,
  totalEquity: MaybeNumber,
): number | null {
  if (!isPositive(totalEquity)) return null;
  if (!isFiniteNumber(totalDebt) || totalDebt < 0) return null;
  return totalDebt / totalEquity;
}

/**
 * Return on equity as a percentage: net income ÷ equity × 100. Net income
 * may legitimately be negative (a real, meaningful negative ROE), so only the
 * equity denominator must be positive; a missing net income → null.
 */
export function returnOnEquity(
  netIncome: MaybeNumber,
  totalEquity: MaybeNumber,
): number | null {
  if (!isPositive(totalEquity)) return null;
  if (!isFiniteNumber(netIncome)) return null;
  return (netIncome / totalEquity) * 100;
}

/**
 * Current ratio: current assets ÷ current liabilities. Null when current
 * liabilities are missing or non-positive, or current assets are unknown.
 */
export function currentRatio(
  currentAssets: MaybeNumber,
  currentLiabilities: MaybeNumber,
): number | null {
  if (!isPositive(currentLiabilities)) return null;
  if (!isFiniteNumber(currentAssets) || currentAssets < 0) return null;
  return currentAssets / currentLiabilities;
}

// ---------------------------------------------------------------------------
// Convenience: compose all six ratios into the ordered strip the UI renders.
// Still pure — the caller extracts the raw numbers from the statements/quote
// and hands them in. `value: null` tiles render as "—" / "Unavailable".
// ---------------------------------------------------------------------------

export type RatioInputs = {
  /** Latest quote price, in the instrument's currency. */
  price: MaybeNumber;
  earningsPerShare: MaybeNumber;
  bookValuePerShare: MaybeNumber;
  /** Trailing annual dividend per share. */
  dividendPerShare: MaybeNumber;
  totalDebt: MaybeNumber;
  totalEquity: MaybeNumber;
  netIncome: MaybeNumber;
  currentAssets: MaybeNumber;
  currentLiabilities: MaybeNumber;
};

export type RatioTile = {
  key: string;
  label: string;
  /** The computed value, or null when it can't be honestly computed. */
  value: number | null;
  /** True when the value is a percentage (Dividend Yield, ROE). */
  percent: boolean;
};

/** Build the ordered ratio strip (ui-spec §4.2), each tile failing independently. */
export function deriveRatios(inputs: RatioInputs): RatioTile[] {
  return [
    {
      key: "pe",
      label: "P/E",
      value: priceToEarnings(inputs.price, inputs.earningsPerShare),
      percent: false,
    },
    {
      key: "pb",
      label: "P/B",
      value: priceToBook(inputs.price, inputs.bookValuePerShare),
      percent: false,
    },
    {
      key: "dividend-yield",
      label: "Dividend Yield",
      value: dividendYield(inputs.dividendPerShare, inputs.price),
      percent: true,
    },
    {
      key: "debt-equity",
      label: "Debt/Equity",
      value: debtToEquity(inputs.totalDebt, inputs.totalEquity),
      percent: false,
    },
    {
      key: "roe",
      label: "ROE",
      value: returnOnEquity(inputs.netIncome, inputs.totalEquity),
      percent: true,
    },
    {
      key: "current-ratio",
      label: "Current Ratio",
      value: currentRatio(inputs.currentAssets, inputs.currentLiabilities),
      percent: false,
    },
  ];
}

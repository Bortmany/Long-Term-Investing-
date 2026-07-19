// Pure ratio-derivation math for the /stocks/[id] ratio strip and the
// STOCK_SCORE AI input (BUILD-PLAN.md Phase 3). No I/O here — every function
// takes plain data the caller already fetched through the src/lib/data
// barrel and returns a typed result. GOLDEN RULE: each ratio is derived
// INDEPENDENTLY from its own inputs, so one missing field only makes that
// ONE ratio unavailable — it never blanks the whole strip, and it never
// falls back to a fabricated 0.
import type { PricePoint } from "@/lib/data";

export type RatioResult = { ok: true; value: number } | { ok: false };

const ok = (value: number): RatioResult => ({ ok: true, value });
const UNAVAILABLE: RatioResult = { ok: false };

/** Read a numeric field off a raw FMP statement row (Record<string, unknown>). */
function num(
  row: Record<string, unknown> | undefined,
  key: string,
): number | null {
  if (!row) return null;
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseRowDate(row: Record<string, unknown>): number {
  const value = row.date;
  if (typeof value !== "string") return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * The most recent fiscal period in a statement's rows, by the row's own
 * `date` field. Never throws — falls back to the first row if dates can't be
 * parsed, so a provider quirk never crashes the ratio strip.
 */
export function latestStatementRow(
  rows: Record<string, unknown>[] | undefined,
): Record<string, unknown> | undefined {
  if (!rows || rows.length === 0) return undefined;
  return [...rows].sort((a, b) => parseRowDate(b) - parseRowDate(a))[0];
}

/** Price ÷ diluted EPS. Negative or missing earnings make P/E meaningless — never a fake number. */
export function computePriceToEarnings(
  price: number | null,
  income: Record<string, unknown> | undefined,
): RatioResult {
  const eps = num(income, "epsdiluted") ?? num(income, "eps");
  if (price === null || eps === null || eps <= 0) return UNAVAILABLE;
  return ok(price / eps);
}

/**
 * Price ÷ book value per share, where book value per share = total
 * stockholders' equity ÷ weighted average shares outstanding — both already
 * present in the statements the ratio strip fetches, so this needs no extra
 * profile/market-cap lookup.
 */
export function computePriceToBook(
  price: number | null,
  income: Record<string, unknown> | undefined,
  balance: Record<string, unknown> | undefined,
): RatioResult {
  const equity = num(balance, "totalStockholdersEquity");
  const shares = num(income, "weightedAverageShsOut");
  if (price === null || equity === null || shares === null || shares <= 0)
    return UNAVAILABLE;
  const bookValuePerShare = equity / shares;
  if (bookValuePerShare <= 0) return UNAVAILABLE;
  return ok(price / bookValuePerShare);
}

/** Trailing-12-month dividends per share ÷ price, as a percentage. */
export function computeDividendYield(
  price: number | null,
  trailingDividendPerShare: number | null,
): RatioResult {
  if (price === null || price <= 0 || trailingDividendPerShare === null)
    return UNAVAILABLE;
  return ok((trailingDividendPerShare / price) * 100);
}

/**
 * Total liabilities ÷ equity — a conservative debt/equity proxy. FMP doesn't
 * reliably return a dedicated interest-bearing "totalDebt" field for every
 * ticker, but totalLiabilities/totalStockholdersEquity is present whenever
 * the balance sheet loaded at all.
 */
export function computeDebtToEquity(
  balance: Record<string, unknown> | undefined,
): RatioResult {
  const liabilities = num(balance, "totalLiabilities");
  const equity = num(balance, "totalStockholdersEquity");
  if (liabilities === null || equity === null || equity === 0)
    return UNAVAILABLE;
  return ok(liabilities / equity);
}

/** Net income ÷ equity, as a percentage. */
export function computeReturnOnEquity(
  income: Record<string, unknown> | undefined,
  balance: Record<string, unknown> | undefined,
): RatioResult {
  const netIncome = num(income, "netIncome");
  const equity = num(balance, "totalStockholdersEquity");
  if (netIncome === null || equity === null || equity === 0) return UNAVAILABLE;
  return ok((netIncome / equity) * 100);
}

/** Current assets ÷ current liabilities. */
export function computeCurrentRatio(
  balance: Record<string, unknown> | undefined,
): RatioResult {
  const assets = num(balance, "totalCurrentAssets");
  const liabilities = num(balance, "totalCurrentLiabilities");
  if (assets === null || liabilities === null || liabilities === 0)
    return UNAVAILABLE;
  return ok(assets / liabilities);
}

/**
 * Percent change between the two most recent DISTINCT price points known to
 * the app — the same honest "change" the price-history chart's last two
 * points show. Deliberately not a fabricated "vs. yesterday" figure: when a
 * manually-priced instrument's last two stored points are months apart,
 * that's still the truth, and fewer than two points means honestly
 * unavailable rather than a stray 0%.
 */
export function computeChangePercent(
  points: Pick<PricePoint, "date" | "close">[],
): RatioResult {
  if (points.length < 2) return UNAVAILABLE;
  const sorted = [...points].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const previous = sorted[sorted.length - 2];
  const latest = sorted[sorted.length - 1];
  if (previous.close <= 0) return UNAVAILABLE;
  return ok(((latest.close - previous.close) / previous.close) * 100);
}

/** Sum of amount-per-share for dividend payments with an ex-date in the trailing 12 months. */
export function sumTrailingDividendsPerShare(
  payments: { exDate: Date; amountPerShare: number }[],
  now: Date,
): number | null {
  const cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const trailing = payments.filter(
    (p) => p.exDate >= cutoff && p.exDate <= now,
  );
  if (trailing.length === 0) return null;
  return trailing.reduce((sum, p) => sum + p.amountPerShare, 0);
}

/** The fixed 1-year lookback the price-history chart and day-change figure share. */
export function oneYearRange(now: Date): { from: Date; to: Date } {
  const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  return { from, to: now };
}

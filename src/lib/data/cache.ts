// Pure cache-freshness logic — no I/O, fully unit-testable.
//
// CACHING RULE (see docs/CONVENTIONS.md): quote reads go through PriceCache
// with a 15-minute TTL; fundamentals go through FundamentalsCache with a
// 7-day TTL. Callers never hit FMP directly.

export const QUOTE_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const FUNDAMENTALS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const FX_RATE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day (FX refreshes daily)
// News moves faster than the rest of fundamentals (profile, statements,
// dividends) — it shares the FundamentalsCache table (period key "news") but
// gets its own, much shorter freshness rule instead of the 7-day one.
export const NEWS_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

/** True when a cache entry fetched at `fetchedAt` is still fresh at `now`. */
export function isCacheFresh(
  fetchedAt: Date,
  ttlMs: number,
  now: Date = new Date(),
): boolean {
  const age = now.getTime() - fetchedAt.getTime();
  return age >= 0 && age < ttlMs;
}

export function isQuoteFresh(fetchedAt: Date, now: Date = new Date()): boolean {
  return isCacheFresh(fetchedAt, QUOTE_TTL_MS, now);
}

export function areFundamentalsFresh(
  fetchedAt: Date,
  now: Date = new Date(),
): boolean {
  return isCacheFresh(fetchedAt, FUNDAMENTALS_TTL_MS, now);
}

export function isFxRateFresh(fetchedAt: Date, now: Date = new Date()): boolean {
  return isCacheFresh(fetchedAt, FX_RATE_TTL_MS, now);
}

export function isNewsFresh(fetchedAt: Date, now: Date = new Date()): boolean {
  return isCacheFresh(fetchedAt, NEWS_TTL_MS, now);
}

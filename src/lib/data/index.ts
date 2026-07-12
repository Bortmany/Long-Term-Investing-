// Public API of the market-data layer.
// Builder 2: import from here (or ./market-data) — NEVER from ./fmp directly.
// The market-data functions enforce the caching rule (15-minute quote TTL,
// 7-day fundamentals TTL) and the golden rule (typed unavailable results,
// no fabricated numbers).

export {
  getDividendHistory,
  getFinancialStatements,
  getPriceHistory,
  getProfile,
  getQuote,
  getUpcomingDividends,
  createPrismaMarketDataStore,
  type MarketDataCacheStore,
  type MarketDataDeps,
} from "./market-data";
// Note: getProvider is deliberately NOT re-exported here — it returns a raw,
// UNCACHED provider that bypasses the TTL rule. Internal code and tests that
// truly need it import it directly from ./provider.
export {
  badgeForPriceSource,
  resolveProviderName,
  unavailable,
  type CompanyProfile,
  type DataResult,
  type DividendPayment,
  type FinancialStatements,
  type InstrumentRef,
  type MarketDataProvider,
  type PricePoint,
  type ProviderName,
  type Quote,
  type SourceBadge,
  type StatementKind,
  type StatementPeriod,
  type Unavailable,
  type UnavailableReason,
  type UpcomingDividend,
} from "./provider";
export {
  areFundamentalsFresh,
  FUNDAMENTALS_TTL_MS,
  isCacheFresh,
  isQuoteFresh,
  QUOTE_TTL_MS,
} from "./cache";

import type { Currency, Market, PriceSource } from "@prisma/client";
import {
  DEFAULT_TWELVE_DATA_MARKETS,
  getTwelveDataMarketEntry,
  twelveDataBaseUrlFromEnv,
  twelveDataRoutingFromEnv,
  type TwelveDataRouting,
} from "./provider-info";

// ---------------------------------------------------------------------------
// Shared result types — GOLDEN RULE support.
//
// Every provider method returns a DataResult<T>. When the underlying source
// cannot answer (no API key, network error, no data…) the method returns the
// typed "unavailable" branch. Nothing in this layer ever invents a number.
// ---------------------------------------------------------------------------

export type UnavailableReason =
  | "no_api_key"
  | "provider_error"
  | "rate_limited"
  | "not_supported"
  | "no_data";

export type Unavailable = {
  ok: false;
  unavailable: UnavailableReason;
  /** Optional human-readable detail (never contains secrets). */
  message?: string;
};

export type DataResult<T> = { ok: true; data: T } | Unavailable;

export function unavailable(
  reason: UnavailableReason,
  message?: string,
): Unavailable {
  return { ok: false, unavailable: reason, message };
}

// ---------------------------------------------------------------------------
// Source badges — every figure that leaves this layer carries one, so the UI
// can always show where a number came from and how old it is.
// ---------------------------------------------------------------------------

/** "live" = fetched from a real provider, "manual" = entered by hand, "sample" = seeded demo data. */
export type SourceBadge = "live" | "manual" | "sample";

export function badgeForPriceSource(source: PriceSource): SourceBadge {
  switch (source) {
    case "FMP":
    case "TWELVE_DATA":
      return "live";
    case "MANUAL":
      return "manual";
    case "SEED":
      return "sample";
  }
}

// ---------------------------------------------------------------------------
// Data shapes returned by providers
// ---------------------------------------------------------------------------

/** The minimal instrument info providers need. Pass a Prisma Instrument or a plain object. */
export type InstrumentRef = {
  id: string;
  ticker: string;
  market: Market;
  currency: Currency;
};

export type Quote = {
  price: number;
  currency: Currency;
  /** When the price is FOR (market timestamp). */
  asOf: Date;
  source: SourceBadge;
  fetchedAt: Date;
  /**
   * The true origin of the price (FMP, TWELVE_DATA, MANUAL, SEED). Lets the
   * badge name the real provider and the alert engine record it correctly.
   * Optional so older code and tests keep working: when unset, `source`
   * ("live"/"manual"/"sample") is mapped the way it always was.
   */
  priceSource?: PriceSource;
  /**
   * True when the provider did not answer and this is the newest price we
   * had stored, shown with its own date. The badge says so.
   */
  fallback?: boolean;
};

export type PricePoint = {
  date: Date;
  close: number;
  currency: Currency;
  source: SourceBadge;
};

export type CompanyProfile = {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  country: string | null;
  description: string | null;
  marketCap: number | null;
  currency: Currency;
  source: SourceBadge;
  asOf: Date;
};

export type StatementKind = "income" | "balance" | "cash-flow";
export type StatementPeriod = "annual" | "quarter";

export type FinancialStatements = {
  kind: StatementKind;
  period: StatementPeriod;
  /** Raw statement rows as returned by the provider (one object per fiscal period). */
  rows: Record<string, unknown>[];
  source: SourceBadge;
  asOf: Date;
};

export type DividendPayment = {
  exDate: Date;
  paymentDate: Date | null;
  amountPerShare: number;
  currency: Currency;
  source: SourceBadge;
};

export type UpcomingDividend = {
  exDate: Date;
  paymentDate: Date | null;
  amountPerShare: number | null;
  currency: Currency;
  source: SourceBadge;
};

/**
 * One news article, trimmed to what NEWS_SUMMARY actually needs (no article
 * URL is kept — nothing in the UI links out to one, so there's no reason to
 * carry it through the cache at all). Not part of MarketDataProvider: like
 * FX rates, news isn't a thing every provider can answer, so it's fetched
 * directly from FMP (src/lib/data/fmp.ts's fetchFmpNews) and typed
 * unavailable for every other routing outcome (see getNews in market-data.ts).
 */
export type NewsArticle = {
  title: string;
  text: string | null;
  /** Publication name, e.g. "Reuters" — null when FMP didn't report one. */
  source: string | null;
  publishedAt: Date;
};

// ---------------------------------------------------------------------------
// The provider interface
// ---------------------------------------------------------------------------

export interface MarketDataProvider {
  readonly name: "fmp" | "twelve-data" | "manual";
  getQuote(instrument: InstrumentRef): Promise<DataResult<Quote>>;
  getPriceHistory(
    instrument: InstrumentRef,
    range: { from: Date; to: Date },
  ): Promise<DataResult<PricePoint[]>>;
  getProfile(instrument: InstrumentRef): Promise<DataResult<CompanyProfile>>;
  getFinancialStatements(
    instrument: InstrumentRef,
    kind: StatementKind,
    period: StatementPeriod,
  ): Promise<DataResult<FinancialStatements>>;
  getDividendHistory(
    instrument: InstrumentRef,
  ): Promise<DataResult<DividendPayment[]>>;
  getUpcomingDividends(
    instrument: InstrumentRef,
  ): Promise<DataResult<UpcomingDividend[]>>;
}

// ---------------------------------------------------------------------------
// Provider routing:
//   - US-market instrument + FMP key            -> FMP
//   - market in the Twelve Data table, named in TWELVE_DATA_MARKETS, and a
//     Twelve Data key is set                    -> Twelve Data
//   - everything else (MSX and OTHER always; any market without a provider
//     or key)                                   -> manual / seeded prices
// Twelve Data is DORMANT: with no key the third input is absent and routing
// is exactly what it was before it existed.
// ---------------------------------------------------------------------------

export type ProviderName = "fmp" | "twelve-data" | "manual";

/** Pure routing decision — exported separately so it is unit-testable. */
export function resolveProviderName(
  market: Market,
  fmpApiKey: string | null | undefined,
  twelveData?: TwelveDataRouting | null,
): ProviderName {
  if (market === "US" && fmpApiKey) {
    return "fmp";
  }
  if (
    twelveData?.apiKey &&
    getTwelveDataMarketEntry(market) !== null &&
    (twelveData.markets ?? DEFAULT_TWELVE_DATA_MARKETS).includes(market)
  ) {
    return "twelve-data";
  }
  return "manual";
}

// INTERNAL / UNCACHED: returns the raw provider with no PriceCache /
// FundamentalsCache TTL layer. App code must go through market-data.ts
// instead; this is intentionally not exported from the ./index barrel.
export async function getProvider(
  instrument: Pick<InstrumentRef, "market">,
  options?: { fmpApiKey?: string | null; twelveData?: TwelveDataRouting | null },
): Promise<MarketDataProvider> {
  const apiKey =
    options?.fmpApiKey !== undefined
      ? options.fmpApiKey
      : (process.env.FMP_API_KEY ?? null);
  const twelveData =
    options?.twelveData !== undefined ? options.twelveData : twelveDataRoutingFromEnv();
  const name = resolveProviderName(instrument.market, apiKey || null, twelveData);

  if (name === "fmp") {
    const { createFmpProvider } = await import("./fmp");
    return createFmpProvider({ apiKey });
  }
  if (name === "twelve-data") {
    const { createTwelveDataProvider } = await import("./twelve-data");
    return createTwelveDataProvider({
      apiKey: twelveData?.apiKey,
      baseUrl: twelveDataBaseUrlFromEnv(),
    });
  }
  const { createManualProvider } = await import("./manual");
  return createManualProvider();
}

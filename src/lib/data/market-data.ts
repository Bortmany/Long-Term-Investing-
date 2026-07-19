// The ONLY entry point callers (pages, API routes, jobs) use for market data.
//
// CACHING RULE enforced here:
//   - quotes go through PriceCache with a 15-minute TTL,
//   - profile / statements / dividends go through FundamentalsCache with a
//     7-day TTL,
//   - callers never talk to FMP directly.
//
// GOLDEN RULE: on any miss where the source is unavailable, the typed
// "unavailable" result is returned — never a fabricated number. If a stale
// cached value exists it is returned with its honest as-of date and badge.

import { Currency, type PriceSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  areFundamentalsFresh,
  isFxRateFresh,
  isNewsFresh,
  isQuoteFresh,
} from "./cache";
import { createManualProvider, createPrismaPriceStore, type ManualPriceStore } from "./manual";
import { createFmpProvider, fetchFmpFxRate, fetchFmpNews } from "./fmp";
import {
  badgeForPriceSource,
  resolveProviderName,
  type CompanyProfile,
  type DataResult,
  type DividendPayment,
  type FinancialStatements,
  type InstrumentRef,
  type MarketDataProvider,
  type NewsArticle,
  type PricePoint,
  type Quote,
  type SourceBadge,
  type StatementKind,
  type StatementPeriod,
  type UnavailableReason,
  type UpcomingDividend,
  unavailable,
} from "./provider";

// ---------------------------------------------------------------------------
// Storage port (injectable so unit tests need no database)
// ---------------------------------------------------------------------------

export interface MarketDataCacheStore extends ManualPriceStore {
  savePrice(
    instrumentId: string,
    entry: {
      price: number;
      currency: InstrumentRef["currency"];
      asOf: Date;
      source: PriceSource;
      fetchedAt: Date;
    },
  ): Promise<void>;
  getFundamentals(
    instrumentId: string,
    key: string,
  ): Promise<{ payload: unknown; fetchedAt: Date } | null>;
  saveFundamentals(
    instrumentId: string,
    key: string,
    payload: unknown,
    source: PriceSource,
    fetchedAt: Date,
  ): Promise<void>;
}

export function createPrismaMarketDataStore(): MarketDataCacheStore {
  const priceStore = createPrismaPriceStore();
  return {
    ...priceStore,
    async savePrice(instrumentId, entry) {
      await prisma.priceCache.create({
        data: {
          instrumentId,
          price: entry.price,
          currency: entry.currency,
          asOf: entry.asOf,
          source: entry.source,
          fetchedAt: entry.fetchedAt,
        },
      });
    },
    async getFundamentals(instrumentId, key) {
      const row = await prisma.fundamentalsCache.findUnique({
        where: { instrumentId_period: { instrumentId, period: key } },
      });
      if (!row) return null;
      return { payload: row.payload, fetchedAt: row.fetchedAt };
    },
    async saveFundamentals(instrumentId, key, payload, source, fetchedAt) {
      const data = {
        payload: payload as object,
        source,
        fetchedAt,
      };
      await prisma.fundamentalsCache.upsert({
        where: { instrumentId_period: { instrumentId, period: key } },
        create: { instrumentId, period: key, ...data },
        update: data,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Dependencies (all injectable for tests)
// ---------------------------------------------------------------------------

export type MarketDataDeps = {
  store?: MarketDataCacheStore;
  fmpApiKey?: string | null;
  fetchFn?: typeof fetch;
  now?: Date;
  /** Test override for the routed provider. */
  provider?: MarketDataProvider;
};

function resolveDeps(instrument: InstrumentRef, deps: MarketDataDeps) {
  const store = deps.store ?? createPrismaMarketDataStore();
  const now = deps.now ?? new Date();
  const apiKey =
    deps.fmpApiKey !== undefined
      ? deps.fmpApiKey
      : (process.env.FMP_API_KEY ?? null);
  const providerName = resolveProviderName(instrument.market, apiKey || null);
  const provider =
    deps.provider ??
    (providerName === "fmp"
      ? createFmpProvider({ apiKey, fetchFn: deps.fetchFn })
      : createManualProvider(store));
  return { store, now, provider, providerName, apiKey };
}

// ---------------------------------------------------------------------------
// Quotes — PriceCache, 15-minute TTL
// ---------------------------------------------------------------------------

export async function getQuote(
  instrument: InstrumentRef,
  deps: MarketDataDeps = {},
): Promise<DataResult<Quote>> {
  const { store, now, provider, providerName } = resolveDeps(instrument, deps);

  // Manual-routed instruments: the cache IS the source of truth. Manual
  // prices do not expire; their as-of date is shown to the user instead.
  if (providerName === "manual") {
    return provider.getQuote(instrument);
  }

  // FMP-routed: serve from cache while fresh (15-minute TTL).
  const cached = await store.getLatestPrice(instrument.id);
  if (cached && cached.source === "FMP" && isQuoteFresh(cached.fetchedAt, now)) {
    return {
      ok: true,
      data: {
        price: cached.price,
        currency: cached.currency,
        asOf: cached.asOf,
        source: badgeForPriceSource(cached.source),
        fetchedAt: cached.fetchedAt,
      },
    };
  }

  const fresh = await provider.getQuote(instrument);
  if (fresh.ok) {
    await store.savePrice(instrument.id, {
      price: fresh.data.price,
      currency: fresh.data.currency,
      asOf: fresh.data.asOf,
      source: "FMP",
      fetchedAt: now,
    });
    return fresh;
  }

  // Provider failed. If we hold ANY older stored price, return it with its
  // honest badge and as-of date rather than nothing — but never invent one.
  if (cached) {
    return {
      ok: true,
      data: {
        price: cached.price,
        currency: cached.currency,
        asOf: cached.asOf,
        source: badgeForPriceSource(cached.source),
        fetchedAt: cached.fetchedAt,
      },
    };
  }
  return fresh;
}

// ---------------------------------------------------------------------------
// Price history — pass-through to the routed provider (manual history comes
// from PriceCache rows; FMP history is fetched on demand, not TTL-cached).
// ---------------------------------------------------------------------------

export async function getPriceHistory(
  instrument: InstrumentRef,
  range: { from: Date; to: Date },
  deps: MarketDataDeps = {},
): Promise<DataResult<PricePoint[]>> {
  const { provider } = resolveDeps(instrument, deps);
  return provider.getPriceHistory(instrument, range);
}

// ---------------------------------------------------------------------------
// Fundamentals — FundamentalsCache, 7-day TTL
// ---------------------------------------------------------------------------

async function throughFundamentalsCache<T>(
  instrument: InstrumentRef,
  cacheKey: string,
  deps: MarketDataDeps,
  fetchFresh: (provider: MarketDataProvider) => Promise<DataResult<T>>,
  reviveDates: (payload: unknown) => T,
  // Defaults to the 7-day fundamentals TTL; getNews below passes isNewsFresh
  // (1 day) instead — same FundamentalsCache table, its own freshness rule.
  isFresh: (fetchedAt: Date, now: Date) => boolean = areFundamentalsFresh,
): Promise<DataResult<T>> {
  const { store, now, provider, providerName } = resolveDeps(instrument, deps);

  const cached = await store.getFundamentals(instrument.id, cacheKey);
  if (cached && isFresh(cached.fetchedAt, now)) {
    return { ok: true, data: reviveDates(cached.payload) };
  }

  const fresh = await fetchFresh(provider);
  if (fresh.ok) {
    await store.saveFundamentals(
      instrument.id,
      cacheKey,
      fresh.data,
      providerName === "fmp" ? "FMP" : "MANUAL",
      now,
    );
    return fresh;
  }

  // Stale cache beats nothing — the payload keeps its own as-of dates.
  if (cached) {
    return { ok: true, data: reviveDates(cached.payload) };
  }
  return fresh;
}

function reviveDate(value: unknown): Date {
  return new Date(value as string);
}

function reviveNullableDate(value: unknown): Date | null {
  return value ? new Date(value as string) : null;
}

export async function getProfile(
  instrument: InstrumentRef,
  deps: MarketDataDeps = {},
): Promise<DataResult<CompanyProfile>> {
  return throughFundamentalsCache(
    instrument,
    "profile",
    deps,
    (provider) => provider.getProfile(instrument),
    (payload) => {
      const p = payload as CompanyProfile;
      return { ...p, asOf: reviveDate(p.asOf) };
    },
  );
}

export async function getFinancialStatements(
  instrument: InstrumentRef,
  kind: StatementKind,
  period: StatementPeriod,
  deps: MarketDataDeps = {},
): Promise<DataResult<FinancialStatements>> {
  return throughFundamentalsCache(
    instrument,
    `statements-${kind}-${period}`,
    deps,
    (provider) => provider.getFinancialStatements(instrument, kind, period),
    (payload) => {
      const s = payload as FinancialStatements;
      return { ...s, asOf: reviveDate(s.asOf) };
    },
  );
}

export async function getDividendHistory(
  instrument: InstrumentRef,
  deps: MarketDataDeps = {},
): Promise<DataResult<DividendPayment[]>> {
  return throughFundamentalsCache(
    instrument,
    "dividends",
    deps,
    (provider) => provider.getDividendHistory(instrument),
    (payload) =>
      (payload as DividendPayment[]).map((d) => ({
        ...d,
        exDate: reviveDate(d.exDate),
        paymentDate: reviveNullableDate(d.paymentDate),
      })),
  );
}

export async function getUpcomingDividends(
  instrument: InstrumentRef,
  deps: MarketDataDeps = {},
): Promise<DataResult<UpcomingDividend[]>> {
  return throughFundamentalsCache(
    instrument,
    "upcoming-dividends",
    deps,
    (provider) => provider.getUpcomingDividends(instrument),
    (payload) =>
      (payload as UpcomingDividend[]).map((d) => ({
        ...d,
        exDate: reviveDate(d.exDate),
        paymentDate: reviveNullableDate(d.paymentDate),
      })),
  );
}

// ---------------------------------------------------------------------------
// News — FundamentalsCache under period key "news", 1-DAY TTL (its own,
// shorter freshness rule — see isNewsFresh in ./cache.ts). Not every provider
// can answer this (same reasoning as FX): only FMP-routed instruments ever
// have news, so anything else — a manual market (MSX/TADAWUL/DFM/OTHER), or
// a US instrument with no FMP_API_KEY — gets the typed unavailable result,
// never a fabricated "no news" that pretends to have checked.
// ---------------------------------------------------------------------------

export async function getNews(
  instrument: InstrumentRef,
  deps: MarketDataDeps = {},
): Promise<DataResult<NewsArticle[]>> {
  const { providerName, apiKey } = resolveDeps(instrument, deps);

  if (providerName !== "fmp") {
    return unavailable(
      "not_supported",
      "News summaries require a live market-data connection for this instrument.",
    );
  }

  return throughFundamentalsCache(
    instrument,
    "news",
    deps,
    () => fetchFmpNews(instrument, { apiKey, fetchFn: deps.fetchFn }),
    (payload) =>
      (payload as NewsArticle[]).map((article) => ({
        ...article,
        publishedAt: reviveDate(article.publishedAt),
      })),
    isNewsFresh,
  );
}

// ---------------------------------------------------------------------------
// FX rates — FxRate table, DAILY TTL.
//
// Same pattern as quotes: serve a fresh FMP-sourced row from the FxRate
// table; on a miss, fetch from FMP and store it (source FMP); when FMP is
// unreachable, serve the newest stored rate with its honest badge — or the
// typed unavailable result when nothing is stored. Never a silent 1.0.
// ---------------------------------------------------------------------------

/** One usable FX rate: 1 unit of `base` = `rate` units of `quote`. */
export type FxRateQuote = {
  base: Currency;
  quote: Currency;
  rate: number;
  asOf: Date;
  source: SourceBadge;
};

/** Narrow storage port so unit tests can run without a database. */
export interface FxRateStore {
  getLatestRate(
    base: Currency,
    quote: Currency,
  ): Promise<{ rate: number; asOf: Date; source: PriceSource } | null>;
  saveRate(entry: {
    base: Currency;
    quote: Currency;
    rate: number;
    asOf: Date;
    source: PriceSource;
  }): Promise<void>;
}

export function createPrismaFxRateStore(): FxRateStore {
  return {
    async getLatestRate(base, quote) {
      const row = await prisma.fxRate.findFirst({
        where: { base, quote },
        orderBy: { asOf: "desc" },
      });
      if (!row) return null;
      return { rate: row.rate.toNumber(), asOf: row.asOf, source: row.source };
    },
    async saveRate(entry) {
      // Upsert on the [base, quote, asOf] unique key so re-fetching the same
      // day's rate never crashes on the constraint.
      await prisma.fxRate.upsert({
        where: {
          base_quote_asOf: {
            base: entry.base,
            quote: entry.quote,
            asOf: entry.asOf,
          },
        },
        create: entry,
        update: { rate: entry.rate, source: entry.source },
      });
    },
  };
}

export type FxDeps = {
  store?: FxRateStore;
  fmpApiKey?: string | null;
  fetchFn?: typeof fetch;
  now?: Date;
};

function resolveFxDeps(deps: FxDeps) {
  return {
    store: deps.store ?? createPrismaFxRateStore(),
    now: deps.now ?? new Date(),
    apiKey:
      deps.fmpApiKey !== undefined
        ? deps.fmpApiKey
        : (process.env.FMP_API_KEY ?? null),
    fetchFn: deps.fetchFn,
  };
}

/**
 * The FX rate for one currency pair (1 base = rate quote), through the
 * FxRate table with a daily TTL. Manually entered rates never expire — they
 * are served with their honest "manual" badge and as-of date when FMP has
 * nothing fresher to offer.
 */
export async function getFxRate(
  base: Currency,
  quote: Currency,
  deps: FxDeps = {},
): Promise<DataResult<FxRateQuote>> {
  if (base === quote) {
    return unavailable(
      "not_supported",
      "Same-currency pairs need no exchange rate.",
    );
  }
  const { store, now, apiKey, fetchFn } = resolveFxDeps(deps);

  // Serve a stored FMP rate while it is still fresh (daily TTL).
  const cached = await store.getLatestRate(base, quote);
  if (cached && cached.source === "FMP" && isFxRateFresh(cached.asOf, now)) {
    return {
      ok: true,
      data: {
        base,
        quote,
        rate: cached.rate,
        asOf: cached.asOf,
        source: badgeForPriceSource(cached.source),
      },
    };
  }

  const fresh = await fetchFmpFxRate(base, quote, { apiKey, fetchFn });
  if (fresh.ok) {
    await store.saveRate({
      base,
      quote,
      rate: fresh.data.rate,
      asOf: fresh.data.asOf,
      source: "FMP",
    });
    return {
      ok: true,
      data: {
        base,
        quote,
        rate: fresh.data.rate,
        asOf: fresh.data.asOf,
        source: "live",
      },
    };
  }

  // FMP unreachable (or no key): the newest stored rate with its honest
  // badge beats nothing — but never invent one.
  if (cached) {
    return {
      ok: true,
      data: {
        base,
        quote,
        rate: cached.rate,
        asOf: cached.asOf,
        source: badgeForPriceSource(cached.source),
      },
    };
  }
  return fresh;
}

export type FxRefreshReport = {
  baseCurrency: Currency;
  /** Pairs that now have a usable rate (fresh from FMP or served from store). */
  updated: FxRateQuote[];
  /** Pairs that could not be refreshed, with the typed reason. */
  unavailable: {
    base: Currency;
    quote: Currency;
    reason: UnavailableReason;
    message?: string;
  }[];
};

/**
 * Refresh the FX rates for every non-base currency against `baseCurrency`
 * (e.g. base OMR → USD/OMR, SAR/OMR, AED/OMR). Reports what was updated and
 * what stayed unavailable; nothing is ever fabricated for the failed pairs.
 */
export async function refreshFxRates(
  baseCurrency: Currency,
  deps: FxDeps = {},
): Promise<FxRefreshReport> {
  const others = Object.values(Currency).filter((c) => c !== baseCurrency);

  const updated: FxRateQuote[] = [];
  const failed: FxRefreshReport["unavailable"] = [];

  for (const currency of others) {
    const result = await getFxRate(currency, baseCurrency, deps);
    if (result.ok) {
      updated.push(result.data);
    } else {
      failed.push({
        base: currency,
        quote: baseCurrency,
        reason: result.unavailable,
        message: result.message,
      });
    }
  }

  return { baseCurrency, updated, unavailable: failed };
}

export { unavailable };

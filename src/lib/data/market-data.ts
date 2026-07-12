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

import type { PriceSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  areFundamentalsFresh,
  isQuoteFresh,
} from "./cache";
import { createManualProvider, createPrismaPriceStore, type ManualPriceStore } from "./manual";
import { createFmpProvider } from "./fmp";
import {
  badgeForPriceSource,
  resolveProviderName,
  type CompanyProfile,
  type DataResult,
  type DividendPayment,
  type FinancialStatements,
  type InstrumentRef,
  type MarketDataProvider,
  type PricePoint,
  type Quote,
  type StatementKind,
  type StatementPeriod,
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
  return { store, now, provider, providerName };
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
): Promise<DataResult<T>> {
  const { store, now, provider, providerName } = resolveDeps(instrument, deps);

  const cached = await store.getFundamentals(instrument.id, cacheKey);
  if (cached && areFundamentalsFresh(cached.fetchedAt, now)) {
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

export { unavailable };

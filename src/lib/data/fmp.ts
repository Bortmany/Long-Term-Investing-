// Financial Modeling Prep provider.
//
// GOLDEN RULE: when FMP_API_KEY is missing or a request fails, every method
// returns the typed "unavailable" result. This file never fabricates numbers.
//
// NOTE: callers must not use this provider directly — go through
// src/lib/data/market-data.ts, which enforces the PriceCache /
// FundamentalsCache TTLs.

import type { Currency } from "@prisma/client";
import {
  type CompanyProfile,
  type DataResult,
  type DividendPayment,
  type FinancialStatements,
  type InstrumentRef,
  type MarketDataProvider,
  type NewsArticle,
  type PricePoint,
  type Quote,
  type StatementKind,
  type StatementPeriod,
  type UpcomingDividend,
  unavailable,
} from "./provider";

const BASE_URL = "https://financialmodelingprep.com/api/v3";

export type FmpProviderOptions = {
  apiKey: string | null | undefined;
  /** Injectable for tests. Defaults to global fetch. */
  fetchFn?: typeof fetch;
  baseUrl?: string;
};

type FetchJson = (path: string, params?: Record<string, string>) => Promise<DataResult<unknown>>;

function makeFetchJson(options: FmpProviderOptions): FetchJson {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? BASE_URL;

  return async (path, params = {}) => {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("apikey", options.apiKey ?? "");

    let response: Response;
    try {
      response = await fetchFn(url.toString());
    } catch {
      // Never include the URL in messages — it contains the API key.
      return unavailable("provider_error", "Could not reach the market data service.");
    }

    if (response.status === 429) {
      return unavailable("rate_limited", "Market data service rate limit reached.");
    }
    if (!response.ok) {
      return unavailable(
        "provider_error",
        `Market data service answered with status ${response.status}.`,
      );
    }

    try {
      const json = (await response.json()) as unknown;
      return { ok: true, data: json };
    } catch {
      return unavailable("provider_error", "Market data service returned invalid data.");
    }
  };
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ---------------------------------------------------------------------------
// Forex — one FX rate (1 base = rate quote) from FMP's forex quote endpoint.
// Same golden-rule behavior as everything else in this file: no key or a
// failed request returns the typed unavailable result, and error messages
// never contain the URL (it carries the API key).
// ---------------------------------------------------------------------------

export type FmpFxRate = {
  /** 1 unit of `base` = `rate` units of `quote`. */
  rate: number;
  asOf: Date;
};

export async function fetchFmpFxRate(
  base: Currency,
  quote: Currency,
  options: FmpProviderOptions,
): Promise<DataResult<FmpFxRate>> {
  if (!options.apiKey) {
    return unavailable("no_api_key", "FMP_API_KEY is not configured.");
  }
  const fetchJson = makeFetchJson(options);
  const pair = `${base}${quote}`;
  const result = await fetchJson(`/quote/${encodeURIComponent(pair)}`);
  if (!result.ok) return result;

  const rows = Array.isArray(result.data) ? result.data : [];
  const row = rows[0] as Record<string, unknown> | undefined;
  const rate = asNumber(row?.price);
  if (!row || rate === null || rate <= 0) {
    return unavailable("no_data", `No exchange rate available for ${base}/${quote}.`);
  }

  const timestamp = asNumber(row.timestamp);
  const asOf = timestamp !== null ? new Date(timestamp * 1000) : new Date();
  return { ok: true, data: { rate, asOf } };
}

// ---------------------------------------------------------------------------
// News — not part of MarketDataProvider (same reasoning as FX above): not
// every provider can answer it, so market-data.ts's getNews calls this
// directly rather than going through the provider interface. Same golden-
// rule behavior: no key or a failed request returns the typed unavailable
// result, and error messages never contain the request URL (it carries the
// API key — see makeFetchJson's fetch failure branch).
// ---------------------------------------------------------------------------

export async function fetchFmpNews(
  instrument: InstrumentRef,
  options: FmpProviderOptions,
): Promise<DataResult<NewsArticle[]>> {
  if (!options.apiKey) {
    return unavailable("no_api_key", "FMP_API_KEY is not configured.");
  }
  const fetchJson = makeFetchJson(options);
  const result = await fetchJson("/stock_news", {
    tickers: instrument.ticker,
    limit: "10",
  });
  if (!result.ok) return result;

  const rows = Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
  const articles: NewsArticle[] = [];
  for (const raw of rows) {
    const publishedAt = asDate(raw.publishedDate);
    const title = typeof raw.title === "string" ? raw.title : null;
    if (!publishedAt || !title) continue;
    articles.push({
      title,
      text: typeof raw.text === "string" ? raw.text : null,
      source: typeof raw.site === "string" ? raw.site : null,
      publishedAt,
    });
  }
  if (articles.length === 0) {
    return unavailable("no_data", `No recent news found for ${instrument.ticker}.`);
  }
  return { ok: true, data: articles };
}

export function createFmpProvider(options: FmpProviderOptions): MarketDataProvider {
  const hasKey = Boolean(options.apiKey);
  const fetchJson = makeFetchJson(options);

  const noKey = () => unavailable("no_api_key", "FMP_API_KEY is not configured.");

  return {
    name: "fmp",

    async getQuote(instrument: InstrumentRef): Promise<DataResult<Quote>> {
      if (!hasKey) return noKey();
      const result = await fetchJson(`/quote/${encodeURIComponent(instrument.ticker)}`);
      if (!result.ok) return result;

      const rows = Array.isArray(result.data) ? result.data : [];
      const row = rows[0] as Record<string, unknown> | undefined;
      const price = asNumber(row?.price);
      if (!row || price === null) return unavailable("no_data");

      const timestamp = asNumber(row.timestamp);
      const asOf = timestamp !== null ? new Date(timestamp * 1000) : new Date();
      return {
        ok: true,
        data: {
          price,
          currency: instrument.currency,
          asOf,
          source: "live",
          fetchedAt: new Date(),
        },
      };
    },

    async getPriceHistory(
      instrument: InstrumentRef,
      range: { from: Date; to: Date },
    ): Promise<DataResult<PricePoint[]>> {
      if (!hasKey) return noKey();
      const result = await fetchJson(
        `/historical-price-full/${encodeURIComponent(instrument.ticker)}`,
        {
          from: range.from.toISOString().slice(0, 10),
          to: range.to.toISOString().slice(0, 10),
        },
      );
      if (!result.ok) return result;

      const historical = (result.data as { historical?: unknown })?.historical;
      if (!Array.isArray(historical)) return unavailable("no_data");

      const points: PricePoint[] = [];
      for (const raw of historical as Record<string, unknown>[]) {
        const date = asDate(raw.date);
        const close = asNumber(raw.close);
        if (date && close !== null) {
          points.push({ date, close, currency: instrument.currency, source: "live" });
        }
      }
      if (points.length === 0) return unavailable("no_data");
      return { ok: true, data: points };
    },

    async getProfile(instrument: InstrumentRef): Promise<DataResult<CompanyProfile>> {
      if (!hasKey) return noKey();
      const result = await fetchJson(`/profile/${encodeURIComponent(instrument.ticker)}`);
      if (!result.ok) return result;

      const rows = Array.isArray(result.data) ? result.data : [];
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) return unavailable("no_data");

      return {
        ok: true,
        data: {
          ticker: instrument.ticker,
          name: typeof row.companyName === "string" ? row.companyName : instrument.ticker,
          sector: typeof row.sector === "string" ? row.sector : null,
          industry: typeof row.industry === "string" ? row.industry : null,
          country: typeof row.country === "string" ? row.country : null,
          description: typeof row.description === "string" ? row.description : null,
          marketCap: asNumber(row.mktCap),
          currency: instrument.currency,
          source: "live",
          asOf: new Date(),
        },
      };
    },

    async getFinancialStatements(
      instrument: InstrumentRef,
      kind: StatementKind,
      period: StatementPeriod,
    ): Promise<DataResult<FinancialStatements>> {
      if (!hasKey) return noKey();
      const endpoint = {
        income: "income-statement",
        balance: "balance-sheet-statement",
        "cash-flow": "cash-flow-statement",
      }[kind];
      const result = await fetchJson(
        `/${endpoint}/${encodeURIComponent(instrument.ticker)}`,
        { period, limit: "12" },
      );
      if (!result.ok) return result;

      const rows = Array.isArray(result.data)
        ? (result.data as Record<string, unknown>[])
        : [];
      if (rows.length === 0) return unavailable("no_data");
      return {
        ok: true,
        data: { kind, period, rows, source: "live", asOf: new Date() },
      };
    },

    async getDividendHistory(
      instrument: InstrumentRef,
    ): Promise<DataResult<DividendPayment[]>> {
      if (!hasKey) return noKey();
      const result = await fetchJson(
        `/historical-price-full/stock_dividend/${encodeURIComponent(instrument.ticker)}`,
      );
      if (!result.ok) return result;

      const historical = (result.data as { historical?: unknown })?.historical;
      if (!Array.isArray(historical)) return unavailable("no_data");

      const payments: DividendPayment[] = [];
      for (const raw of historical as Record<string, unknown>[]) {
        const exDate = asDate(raw.date);
        const amount = asNumber(raw.dividend) ?? asNumber(raw.adjDividend);
        if (exDate && amount !== null) {
          payments.push({
            exDate,
            paymentDate: asDate(raw.paymentDate),
            amountPerShare: amount,
            currency: instrument.currency,
            source: "live",
          });
        }
      }
      if (payments.length === 0) return unavailable("no_data");
      return { ok: true, data: payments };
    },

    async getUpcomingDividends(
      instrument: InstrumentRef,
    ): Promise<DataResult<UpcomingDividend[]>> {
      if (!hasKey) return noKey();
      const today = new Date();
      const inThreeMonths = new Date(today.getTime() + 92 * 24 * 60 * 60 * 1000);
      const result = await fetchJson("/stock_dividend_calendar", {
        from: today.toISOString().slice(0, 10),
        to: inThreeMonths.toISOString().slice(0, 10),
      });
      if (!result.ok) return result;

      const rows = Array.isArray(result.data)
        ? (result.data as Record<string, unknown>[])
        : [];
      const upcoming: UpcomingDividend[] = [];
      for (const raw of rows) {
        if (raw.symbol !== instrument.ticker) continue;
        const exDate = asDate(raw.date);
        if (!exDate) continue;
        upcoming.push({
          exDate,
          paymentDate: asDate(raw.paymentDate),
          amountPerShare: asNumber(raw.dividend),
          currency: instrument.currency,
          source: "live",
        });
      }
      if (upcoming.length === 0) return unavailable("no_data");
      return { ok: true, data: upcoming };
    },
  };
}

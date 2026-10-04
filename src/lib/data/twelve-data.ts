// Twelve Data provider — Gulf share prices (Tadawul, ADX, QSE, optionally DFM).
//
// DORMANT BY DEFAULT: the router (resolveProviderName in ./provider) only
// picks this provider when TWELVE_DATA_API_KEY is set. With no key nothing in
// this file ever runs and no request is ever made.
//
// GOLDEN RULE: this provider only ever answers with a real, checked price or
// the typed "unavailable" result. A reply is used only when ALL of these hold:
//   - the reply's exchange matches the table's code for the market,
//   - the reply's currency equals the market's expected currency,
//   - the reply's symbol (when it names one) is the one we asked for,
//   - the price is a positive number and the reply says when it is for.
// That stops a wrong ticker mapping from showing another company's price.
//
// Only getQuote is implemented. Profiles, statements, dividends and history
// are "not_supported" (history for these stocks comes from stored prices).
//
// SECRETS: the key travels in a request header (never in the address), is
// never logged, and never appears in any returned message. Error messages
// are fixed sentences — they never include a request address or the text of
// a thrown error (a thrown error could contain the key).
//
// NOTE: callers must not use this provider directly — go through
// src/lib/data/market-data.ts, which enforces the 15-minute price cache.
//
// Reply shapes here come from the decision note and Twelve Data's public
// documentation only; nobody has seen a real reply yet. See the table in
// ./provider-info.ts and the "first real call" check in GO-LIVE.md.

import { logger } from "@/lib/logger";
import {
  getTwelveDataMarketEntry,
  vendorSymbolFor,
  type TwelveDataMarketEntry,
} from "./provider-info";
import {
  type CompanyProfile,
  type DataResult,
  type DividendPayment,
  type FinancialStatements,
  type InstrumentRef,
  type MarketDataProvider,
  type PricePoint,
  type Quote,
  type UpcomingDividend,
  unavailable,
} from "./provider";

const DEFAULT_BASE_URL = "https://api.twelvedata.com";

/** After a rate-limited answer, make no further calls for this long. */
export const TWELVE_DATA_STAND_DOWN_MS = 60 * 1000;

/** Give up on a slow vendor so a page view is never stuck waiting. */
const REQUEST_TIMEOUT_MS = 8000;

export type TwelveDataProviderOptions = {
  apiKey: string | null | undefined;
  /** Injectable for tests. Defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Developer-only test server. The caller passes undefined in production. */
  baseUrl?: string;
  /** Injectable clock (milliseconds) for the stand-down. Defaults to Date.now. */
  nowMs?: () => number;
};

// In-memory stand-down: "do not call until this time". Lost on restart,
// which is harmless — the vendor just says no once more.
let standDownUntilMs = 0;

/** Test helper: forget any stand-down left over from another test. */
export function resetTwelveDataStandDown(): void {
  standDownUntilMs = 0;
}

// ---------------------------------------------------------------------------
// Careful parsing — the vendor sends numbers as text
// ---------------------------------------------------------------------------

/** "27.5" or 27.5 becomes 27.5; "abc", "NaN", "1e3", "", null become null. */
function parsePlainNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** When the price is FOR: the reply's unix timestamp, else its date text. */
function parseAsOf(row: Record<string, unknown>): Date | null {
  const stamp = parsePlainNumber(row.timestamp);
  if (stamp !== null && stamp > 0) {
    const date = new Date(stamp * 1000);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const text = typeof row.datetime === "string" ? row.datetime.trim() : "";
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/.exec(text);
  if (!match) return null;
  // Date-only replies are an end-of-day price: pin to noon UTC so the
  // calendar day is the same in every time zone.
  const iso = match[2] ? `${match[1]}T${match[2]}Z` : `${match[1]}T12:00:00Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameText(a: unknown, b: string): boolean {
  return typeof a === "string" && a.trim().toUpperCase() === b.toUpperCase();
}

// ---------------------------------------------------------------------------
// The quote call
// ---------------------------------------------------------------------------

async function fetchQuote(
  instrument: InstrumentRef,
  entry: TwelveDataMarketEntry,
  options: TwelveDataProviderOptions,
): Promise<DataResult<Quote>> {
  const nowMs = options.nowMs ?? Date.now;
  const fetchFn = options.fetchFn ?? fetch;

  if (nowMs() < standDownUntilMs) {
    return unavailable(
      "rate_limited",
      "Market data service is resting after a rate limit. Try again shortly.",
    );
  }

  // The price will be stored and shown in the instrument's currency, so it
  // must be the market's currency. A mismatch means the record is wrong.
  if (instrument.currency !== entry.currency) {
    return unavailable(
      "no_data",
      `${instrument.ticker} is set up in a different currency than this market quotes in.`,
    );
  }

  const symbol = vendorSymbolFor(instrument.market, instrument.ticker);
  if (!symbol) {
    return unavailable("no_data", `${instrument.ticker} is not a ticker this service can look up.`);
  }

  const url = new URL("/quote", options.baseUrl ?? DEFAULT_BASE_URL);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("exchange", entry.exchange);

  const startStandDown = () => {
    standDownUntilMs = nowMs() + TWELVE_DATA_STAND_DOWN_MS;
  };

  let response: Response;
  try {
    response = await fetchFn(url.toString(), {
      // Key goes in a header, so it is never part of any address.
      headers: { Authorization: `apikey ${options.apiKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Deliberately ignore the error itself: it may contain the address or key.
    logger.warn("Twelve Data quote request failed", { market: instrument.market });
    return unavailable("provider_error", "Could not reach the market data service.");
  }

  if (response.status === 429) {
    startStandDown();
    return unavailable("rate_limited", "Market data service rate limit reached.");
  }
  if (!response.ok) {
    return unavailable(
      "provider_error",
      `Market data service answered with status ${response.status}.`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return unavailable("provider_error", "Market data service returned invalid data.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return unavailable("provider_error", "Market data service returned invalid data.");
  }
  const row = body as Record<string, unknown>;

  // The vendor reports limit and bad-symbol errors INSIDE a normal-looking
  // reply: {"code": 429, "message": "...", "status": "error"}.
  if (row.status === "error" || (typeof row.code === "number" && row.code >= 400)) {
    if (row.code === 429) {
      startStandDown();
      return unavailable("rate_limited", "Market data service rate limit reached.");
    }
    return unavailable("provider_error", "Market data service could not provide this quote.");
  }

  // Wrong-stock guard: exchange, currency and symbol must all match.
  const exchange = row.mic_code ?? row.exchange;
  if (!sameText(exchange, entry.exchange)) {
    return unavailable("no_data", `No matching quote for ${instrument.ticker} on this exchange.`);
  }
  if (!sameText(row.currency, entry.currency)) {
    return unavailable("no_data", `The quote for ${instrument.ticker} is in an unexpected currency.`);
  }
  if (row.symbol !== undefined && !sameText(row.symbol, symbol)) {
    return unavailable("no_data", `No matching quote for ${instrument.ticker}.`);
  }

  // The latest price is the reply's "close"; it must be a positive number.
  const price = parsePlainNumber(row.close);
  if (price === null || price <= 0) {
    return unavailable("no_data", `No valid price for ${instrument.ticker}.`);
  }
  const asOf = parseAsOf(row);
  if (!asOf) {
    return unavailable("no_data", `The quote for ${instrument.ticker} has no usable date.`);
  }

  return {
    ok: true,
    data: {
      price,
      currency: entry.currency,
      asOf,
      source: "live",
      fetchedAt: new Date(),
      priceSource: "TWELVE_DATA",
    },
  };
}

export function createTwelveDataProvider(
  options: TwelveDataProviderOptions,
): MarketDataProvider {
  const noKey = () => unavailable("no_api_key", "TWELVE_DATA_API_KEY is not configured.");
  const notSupported = (what: string) =>
    unavailable("not_supported", `${what} are not available from this market data service.`);

  return {
    name: "twelve-data",

    async getQuote(instrument: InstrumentRef): Promise<DataResult<Quote>> {
      if (!options.apiKey) return noKey();
      const entry = getTwelveDataMarketEntry(instrument.market);
      if (!entry) {
        // MSX, US and OTHER can never be answered by this provider.
        return unavailable("not_supported", "This market is not covered by the market data service.");
      }
      return fetchQuote(instrument, entry, options);
    },

    // Price history for these stocks comes from the stored prices (the
    // router's caller handles that); this provider does not fetch history.
    async getPriceHistory(): Promise<DataResult<PricePoint[]>> {
      return notSupported("Price histories");
    },
    async getProfile(): Promise<DataResult<CompanyProfile>> {
      return notSupported("Company profiles");
    },
    async getFinancialStatements(): Promise<DataResult<FinancialStatements>> {
      return notSupported("Financial statements");
    },
    async getDividendHistory(): Promise<DataResult<DividendPayment[]>> {
      return notSupported("Dividend histories");
    },
    async getUpcomingDividends(): Promise<DataResult<UpcomingDividend[]>> {
      return notSupported("Upcoming dividends");
    },
  };
}

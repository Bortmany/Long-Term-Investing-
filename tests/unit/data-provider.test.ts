import { describe, expect, it, vi } from "vitest";
import {
  FUNDAMENTALS_TTL_MS,
  isCacheFresh,
  isQuoteFresh,
  QUOTE_TTL_MS,
} from "@/lib/data/cache";
import { createFmpProvider } from "@/lib/data/fmp";
import { createManualProvider, type ManualPriceStore } from "@/lib/data/manual";
import { getQuote, type MarketDataCacheStore } from "@/lib/data/market-data";
import { resolveProviderName, type InstrumentRef } from "@/lib/data/provider";

const instrument: InstrumentRef = {
  id: "inst-aapl",
  ticker: "AAPL",
  market: "US",
  currency: "USD",
};

const msxInstrument: InstrumentRef = {
  id: "inst-bkmb",
  ticker: "BKMB",
  market: "MSX",
  currency: "OMR",
};

// ---------------------------------------------------------------------------
// Provider routing
// ---------------------------------------------------------------------------

describe("resolveProviderName", () => {
  it("routes US instruments to FMP when a key is present", () => {
    expect(resolveProviderName("US", "some-key")).toBe("fmp");
  });
  it("routes US instruments to manual when the key is missing", () => {
    expect(resolveProviderName("US", null)).toBe("manual");
    expect(resolveProviderName("US", undefined)).toBe("manual");
  });
  it("routes non-US markets to manual even with a key", () => {
    expect(resolveProviderName("MSX", "some-key")).toBe("manual");
    expect(resolveProviderName("TADAWUL", "some-key")).toBe("manual");
    expect(resolveProviderName("DFM", "some-key")).toBe("manual");
    expect(resolveProviderName("OTHER", "some-key")).toBe("manual");
  });
});

// ---------------------------------------------------------------------------
// TTL logic (pure)
// ---------------------------------------------------------------------------

describe("cache TTL", () => {
  const now = new Date("2026-07-12T12:00:00Z");

  it("quote cache is fresh strictly within 15 minutes", () => {
    expect(isQuoteFresh(new Date(now.getTime() - 14 * 60 * 1000), now)).toBe(true);
    expect(isQuoteFresh(new Date(now.getTime() - QUOTE_TTL_MS), now)).toBe(false);
    expect(isQuoteFresh(new Date(now.getTime() - 16 * 60 * 1000), now)).toBe(false);
  });

  it("fundamentals cache is fresh strictly within 7 days", () => {
    const sixDays = 6 * 24 * 60 * 60 * 1000;
    expect(isCacheFresh(new Date(now.getTime() - sixDays), FUNDAMENTALS_TTL_MS, now)).toBe(true);
    expect(isCacheFresh(new Date(now.getTime() - FUNDAMENTALS_TTL_MS), FUNDAMENTALS_TTL_MS, now)).toBe(false);
  });

  it("entries dated in the future are not considered fresh", () => {
    expect(isCacheFresh(new Date(now.getTime() + 1000), QUOTE_TTL_MS, now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FMP provider — golden rule: no key means typed unavailable, never fake data
// ---------------------------------------------------------------------------

describe("createFmpProvider without an API key", () => {
  const provider = createFmpProvider({ apiKey: null });

  it("returns { unavailable: 'no_api_key' } from every method", async () => {
    const range = { from: new Date("2026-01-01"), to: new Date("2026-07-01") };
    const results = await Promise.all([
      provider.getQuote(instrument),
      provider.getPriceHistory(instrument, range),
      provider.getProfile(instrument),
      provider.getFinancialStatements(instrument, "income", "annual"),
      provider.getDividendHistory(instrument),
      provider.getUpcomingDividends(instrument),
      provider.getStockNews(instrument),
    ]);
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.unavailable).toBe("no_api_key");
      }
    }
  });
});

describe("createFmpProvider with a key", () => {
  it("parses a quote from the FMP response", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify([{ symbol: "AAPL", price: 232.5, timestamp: 1783777200 }]),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const provider = createFmpProvider({ apiKey: "test-key", fetchFn });
    const result = await provider.getQuote(instrument);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.price).toBe(232.5);
      expect(result.data.currency).toBe("USD");
      expect(result.data.source).toBe("live");
    }
  });

  it("returns a typed unavailable result on HTTP errors", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const provider = createFmpProvider({ apiKey: "test-key", fetchFn });
    const result = await provider.getQuote(instrument);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unavailable).toBe("provider_error");
      // Error message must never leak the API key.
      expect(result.message ?? "").not.toContain("test-key");
    }
  });

  it("returns rate_limited on HTTP 429", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 429 })) as unknown as typeof fetch;
    const provider = createFmpProvider({ apiKey: "test-key", fetchFn });
    const result = await provider.getQuote(instrument);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unavailable).toBe("rate_limited");
    }
  });
});

// ---------------------------------------------------------------------------
// Manual provider — serves stored prices with honest badges
// ---------------------------------------------------------------------------

function makeStore(overrides: Partial<MarketDataCacheStore> = {}): MarketDataCacheStore {
  return {
    getLatestPrice: vi.fn(async () => null),
    getPriceHistory: vi.fn(async () => []),
    savePrice: vi.fn(async () => undefined),
    getFundamentals: vi.fn(async () => null),
    saveFundamentals: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("createManualProvider", () => {
  it("serves the latest stored price with its badge and as-of date", async () => {
    const store: ManualPriceStore = {
      getLatestPrice: async () => ({
        price: 0.312,
        currency: "OMR",
        asOf: new Date("2026-07-10"),
        source: "SEED",
        fetchedAt: new Date("2026-07-10"),
      }),
      getPriceHistory: async () => [],
    };
    const provider = createManualProvider(store);
    const result = await provider.getQuote(msxInstrument);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.price).toBe(0.312);
      expect(result.data.source).toBe("sample");
      expect(result.data.asOf).toEqual(new Date("2026-07-10"));
    }
  });

  it("returns unavailable when nothing was ever stored", async () => {
    const provider = createManualProvider({
      getLatestPrice: async () => null,
      getPriceHistory: async () => [],
    });
    const result = await provider.getQuote(msxInstrument);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unavailable).toBe("no_data");
    }
  });
});

// ---------------------------------------------------------------------------
// getQuote facade — enforces the 15-minute PriceCache TTL
// ---------------------------------------------------------------------------

describe("getQuote caching", () => {
  const now = new Date("2026-07-12T12:00:00Z");

  it("serves a fresh cached FMP quote without hitting the network", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const store = makeStore({
      getLatestPrice: vi.fn(async () => ({
        price: 230,
        currency: "USD" as const,
        asOf: new Date(now.getTime() - 5 * 60 * 1000),
        source: "FMP" as const,
        fetchedAt: new Date(now.getTime() - 5 * 60 * 1000),
      })),
    });

    const result = await getQuote(instrument, {
      store,
      fmpApiKey: "test-key",
      fetchFn,
      now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.price).toBe(230);
      expect(result.data.source).toBe("live");
    }
    expect(fetchFn).not.toHaveBeenCalled();
    expect(store.savePrice).not.toHaveBeenCalled();
  });

  it("refetches and stores when the cached quote is older than 15 minutes", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify([{ price: 235, timestamp: now.getTime() / 1000 }]), {
        status: 200,
      }),
    ) as unknown as typeof fetch;
    const store = makeStore({
      getLatestPrice: vi.fn(async () => ({
        price: 230,
        currency: "USD" as const,
        asOf: new Date(now.getTime() - 60 * 60 * 1000),
        source: "FMP" as const,
        fetchedAt: new Date(now.getTime() - 60 * 60 * 1000),
      })),
    });

    const result = await getQuote(instrument, {
      store,
      fmpApiKey: "test-key",
      fetchFn,
      now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.price).toBe(235);
    }
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(store.savePrice).toHaveBeenCalledTimes(1);
  });

  it("falls back to the stale stored price (honest badge) when FMP fails", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const staleDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const store = makeStore({
      getLatestPrice: vi.fn(async () => ({
        price: 228,
        currency: "USD" as const,
        asOf: staleDate,
        source: "MANUAL" as const,
        fetchedAt: staleDate,
      })),
    });

    const result = await getQuote(instrument, {
      store,
      fmpApiKey: "test-key",
      fetchFn,
      now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.price).toBe(228);
      expect(result.data.source).toBe("manual");
      expect(result.data.asOf).toEqual(staleDate);
    }
  });

  it("returns the typed unavailable result when FMP fails and nothing is cached", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const store = makeStore();

    const result = await getQuote(instrument, {
      store,
      fmpApiKey: "test-key",
      fetchFn,
      now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unavailable).toBe("provider_error");
    }
  });

  it("routes non-US instruments to the manual store (no TTL, honest as-of)", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const store = makeStore({
      getLatestPrice: vi.fn(async () => ({
        price: 0.312,
        currency: "OMR" as const,
        asOf: new Date("2026-07-10"),
        source: "SEED" as const,
        fetchedAt: new Date("2026-07-10"),
      })),
    });

    const result = await getQuote(msxInstrument, {
      store,
      fmpApiKey: "test-key",
      fetchFn,
      now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.source).toBe("sample");
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

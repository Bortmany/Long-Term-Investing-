// Twelve Data (Gulf live prices) — the connection is built but dormant, and
// it is tested ONLY with made-up sample replies (tests/fixtures/twelve-data/).
// No test here ever calls the real service; every network call is a fake.
//
// What these tests protect (the golden rule): a price is shown only when it is
// real AND checked — right exchange, right currency, a positive number — and
// anything else is the typed "unavailable" result, never a guess.

import { readFileSync } from "node:fs";
import path from "node:path";
import { Market, type PriceSource } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { badgePropsForPrice } from "@/components/source-badge";
import { sweepAlerts, type AlertRecord, type AlertStore } from "@/lib/alerts/engine";
import {
  getPriceHistory,
  getQuote,
  type MarketDataCacheStore,
} from "@/lib/data/market-data";
import { createManualProvider } from "@/lib/data/manual";
import { resolveProviderName, type InstrumentRef, type Quote } from "@/lib/data/provider";
import {
  TWELVE_DATA_MARKET_TABLE,
  describePriceProvider,
  isPublicDisplayAllowed,
  isTwelveDataConfigured,
  parseTwelveDataMarkets,
  twelveDataBaseUrlFromEnv,
  vendorSymbolFor,
} from "@/lib/data/provider-info";
import {
  TWELVE_DATA_STAND_DOWN_MS,
  createTwelveDataProvider,
  resetTwelveDataStandDown,
} from "@/lib/data/twelve-data";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KEY = "td-secret-key-0123456789";

function fixture(name: string): Record<string, unknown> {
  const file = path.join(__dirname, "..", "fixtures", "twelve-data", name);
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

type FetchCall = { url: string; init?: RequestInit };

/** A fake network that answers with `body` and remembers every call. */
function fakeNetwork(body: unknown, status = 200) {
  const calls: FetchCall[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls, spy: fetchFn };
}

const aramco: InstrumentRef = { id: "i-aramco", ticker: "2222.SR", market: "TADAWUL", currency: "SAR" };
const fab: InstrumentRef = { id: "i-fab", ticker: "FAB", market: "ADX", currency: "AED" };
const qnbk: InstrumentRef = { id: "i-qnbk", ticker: "QNBK", market: "QSE", currency: "QAR" };
const emaar: InstrumentRef = { id: "i-emaar", ticker: "EMAAR", market: "DFM", currency: "AED" };
const bankMuscat: InstrumentRef = { id: "i-bkmb", ticker: "BKMB", market: "MSX", currency: "OMR" };
const otherStock: InstrumentRef = { id: "i-oth", ticker: "XYZ", market: "OTHER", currency: "USD" };

function provider(fetchFn: typeof fetch, extra: { nowMs?: () => number } = {}) {
  return createTwelveDataProvider({ apiKey: KEY, fetchFn, ...extra });
}

async function expectUnavailable(
  fetchFn: typeof fetch,
  instrument: InstrumentRef,
  reason?: string,
) {
  const result = await provider(fetchFn).getQuote(instrument);
  expect(result.ok).toBe(false);
  if (!result.ok && reason) expect(result.unavailable).toBe(reason);
  // Never a price, never the key, never an address.
  expect(JSON.stringify(result)).not.toContain(KEY);
  expect(JSON.stringify(result)).not.toContain("http");
  return result;
}

beforeEach(() => {
  resetTwelveDataStandDown();
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Routing — dormant without a key; only table markets that are switched on
// ---------------------------------------------------------------------------

describe("routing", () => {
  it("with no Twelve Data key, every market routes exactly as it did before", () => {
    for (const market of Object.values(Market)) {
      const before = market === "US" ? "fmp" : "manual";
      // Two-argument form (the old callers) ...
      expect(resolveProviderName(market, "fmp-key")).toBe(before);
      // ... and the new third argument with no key, in every shape "no key" can take.
      for (const noKey of [undefined, null, { apiKey: null }, { apiKey: undefined }, { apiKey: "" }]) {
        expect(resolveProviderName(market, "fmp-key", noKey)).toBe(before);
        // And with no FMP key either: everything is typed-in.
        expect(resolveProviderName(market, null, noKey)).toBe("manual");
      }
    }
  });

  it("with a key, Tadawul, ADX and QSE go to Twelve Data by default", () => {
    const td = { apiKey: KEY };
    expect(resolveProviderName("TADAWUL", null, td)).toBe("twelve-data");
    expect(resolveProviderName("ADX", null, td)).toBe("twelve-data");
    expect(resolveProviderName("QSE", null, td)).toBe("twelve-data");
  });

  it("DFM routes only when it is named in the enabled-markets list", () => {
    expect(resolveProviderName("DFM", null, { apiKey: KEY })).toBe("manual");
    expect(resolveProviderName("DFM", null, { apiKey: KEY, markets: ["TADAWUL", "ADX", "QSE"] })).toBe("manual");
    expect(resolveProviderName("DFM", null, { apiKey: KEY, markets: ["DFM"] })).toBe("twelve-data");
    // A market left out of the list is off even though it has a table row.
    expect(resolveProviderName("TADAWUL", null, { apiKey: KEY, markets: ["QSE"] })).toBe("manual");
  });

  it("MSX and Other never route to any provider, even with every key and every market named", () => {
    const everything = { apiKey: KEY, markets: Object.values(Market) };
    expect(resolveProviderName("MSX", "fmp-key", everything)).toBe("manual");
    expect(resolveProviderName("OTHER", "fmp-key", everything)).toBe("manual");
  });

  it("US keeps going to FMP, and never to Twelve Data", () => {
    expect(resolveProviderName("US", "fmp-key", { apiKey: KEY, markets: Object.values(Market) })).toBe("fmp");
    expect(resolveProviderName("US", null, { apiKey: KEY, markets: Object.values(Market) })).toBe("manual");
  });

  it("only markets in the table can be switched on from the setting", () => {
    expect(parseTwelveDataMarkets(undefined)).toEqual(["TADAWUL", "ADX", "QSE"]);
    expect(parseTwelveDataMarkets("")).toEqual(["TADAWUL", "ADX", "QSE"]);
    expect(parseTwelveDataMarkets("tadawul, dfm")).toEqual(["TADAWUL", "DFM"]);
    expect(parseTwelveDataMarkets("MSX,OTHER,US")).toEqual([]);
  });

  it("the market table has exactly Tadawul, ADX, QSE and DFM", () => {
    expect(Object.keys(TWELVE_DATA_MARKET_TABLE).sort()).toEqual(["ADX", "DFM", "QSE", "TADAWUL"]);
  });

  it("with no key, getQuote reads stored prices and makes no network call at all", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch");
    const { fetchFn, spy } = fakeNetwork(fixture("tadawul-2222.json"));
    const store = makeStore({
      getLatestPrice: vi.fn(async () => ({
        price: 26.5,
        currency: "SAR" as const,
        asOf: new Date("2026-07-10"),
        source: "SEED" as const,
        fetchedAt: new Date("2026-07-10"),
      })),
    });
    for (const instrument of [aramco, fab, qnbk, emaar, bankMuscat, otherStock]) {
      const result = await getQuote(instrument, { store, fetchFn, twelveData: { apiKey: null }, fmpApiKey: null });
      expect(result.ok && result.data.source).toBe("sample");
    }
    expect(spy).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
    expect(store.savePrice).not.toHaveBeenCalled();
  });

  it("the provider itself refuses MSX, US and Other without touching the network", async () => {
    const { fetchFn, spy } = fakeNetwork(fixture("tadawul-2222.json"));
    for (const instrument of [bankMuscat, otherStock, { ...aramco, market: "US" as const }]) {
      const result = await provider(fetchFn).getQuote(instrument);
      expect(result.ok).toBe(false);
    }
    const noKey = await createTwelveDataProvider({ apiKey: null, fetchFn }).getQuote(aramco);
    expect(!noKey.ok && noKey.unavailable).toBe("no_api_key");
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// One test per market
// ---------------------------------------------------------------------------

describe("quotes, one per market (made-up sample replies)", () => {
  const cases: {
    name: string;
    instrument: InstrumentRef;
    file: string;
    symbol: string;
    exchange: string;
    price: number;
    currency: string;
    asOfSeconds: number;
  }[] = [
    // Tadawul: the demo row is "2222.SR"; the vendor wants "2222".
    { name: "Tadawul (strips .SR)", instrument: aramco, file: "tadawul-2222.json", symbol: "2222", exchange: "XSAU", price: 27.45, currency: "SAR", asOfSeconds: 1790596800 },
    { name: "ADX", instrument: fab, file: "adx-fab.json", symbol: "FAB", exchange: "XADS", price: 14.32, currency: "AED", asOfSeconds: 1790590800 },
    { name: "QSE", instrument: qnbk, file: "qse-qnbk.json", symbol: "QNBK", exchange: "DSMD", price: 17.85, currency: "QAR", asOfSeconds: 1790587800 },
    { name: "DFM", instrument: emaar, file: "dfm-emaar.json", symbol: "EMAAR", exchange: "XDFM", price: 13.1, currency: "AED", asOfSeconds: 1790593200 },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const { fetchFn, calls } = fakeNetwork(fixture(c.file));
      const result = await provider(fetchFn).getQuote(c.instrument);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.price).toBe(c.price); // parsed from text
      expect(result.data.currency).toBe(c.currency);
      expect(result.data.asOf).toEqual(new Date(c.asOfSeconds * 1000));
      expect(result.data.source).toBe("live");
      expect(result.data.priceSource).toBe("TWELVE_DATA");

      // Asked for the right symbol on the right exchange — once.
      expect(calls).toHaveLength(1);
      const asked = new URL(calls[0].url);
      expect(asked.searchParams.get("symbol")).toBe(c.symbol);
      expect(asked.searchParams.get("exchange")).toBe(c.exchange);
      // The key goes in a header, never in the address.
      expect(calls[0].url).not.toContain(KEY);
      const headers = calls[0].init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`apikey ${KEY}`);
    });
  }

  it("strips only a trailing .SR and only for Tadawul", () => {
    expect(vendorSymbolFor("TADAWUL", "2222.SR")).toBe("2222");
    expect(vendorSymbolFor("TADAWUL", "2222.sr")).toBe("2222");
    expect(vendorSymbolFor("TADAWUL", "2222")).toBe("2222");
    expect(vendorSymbolFor("TADAWUL", ".SR")).toBe(null);
    expect(vendorSymbolFor("ADX", "FAB")).toBe("FAB");
    expect(vendorSymbolFor("MSX", "BKMB")).toBe(null);
    // Odd input is never sent to the vendor.
    expect(vendorSymbolFor("ADX", "FAB&exchange=XNYS")).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Everything that is not a good, checked price is "unavailable"
// ---------------------------------------------------------------------------

describe("bad replies become the typed unavailable result", () => {
  it("wrong exchange in the reply", async () => {
    const { fetchFn } = fakeNetwork({ ...fixture("tadawul-2222.json"), exchange: "NYSE", mic_code: "XNYS" });
    await expectUnavailable(fetchFn, aramco, "no_data");
  });

  it("wrong exchange when only the exchange field is given", async () => {
    const reply = { ...fixture("adx-fab.json"), exchange: "XDFM" } as Record<string, unknown>;
    delete reply.mic_code;
    await expectUnavailable(fakeNetwork(reply).fetchFn, fab, "no_data");
  });

  it("wrong currency in the reply", async () => {
    const { fetchFn } = fakeNetwork({ ...fixture("tadawul-2222.json"), currency: "USD" });
    await expectUnavailable(fetchFn, aramco, "no_data");
  });

  it("a reply about a different company", async () => {
    const { fetchFn } = fakeNetwork({ ...fixture("adx-fab.json"), symbol: "ADNOC" });
    await expectUnavailable(fetchFn, fab, "no_data");
  });

  it("a stock saved in a currency other than its market's is not looked up", async () => {
    const { fetchFn, spy } = fakeNetwork(fixture("tadawul-2222.json"));
    await expectUnavailable(fetchFn, { ...aramco, currency: "USD" }, "no_data");
    expect(spy).not.toHaveBeenCalled();
  });

  for (const [label, close] of [
    ["zero", "0"],
    ["zero with decimals", "0.00"],
    ["negative", "-3.20"],
    ["garbled text", "abc"],
    ["comma decimal", "27,45"],
    ["not a number", "NaN"],
    ["infinity", "Infinity"],
    ["scientific", "1e3"],
    ["empty", ""],
    ["missing", undefined],
    ["null", null],
    ["an object", { value: 1 }],
  ] as [string, unknown][]) {
    it(`price is ${label}`, async () => {
      const reply = { ...fixture("tadawul-2222.json"), close } as Record<string, unknown>;
      if (close === undefined) delete reply.close;
      await expectUnavailable(fakeNetwork(reply).fetchFn, aramco, "no_data");
    });
  }

  it("a reply with no usable date", async () => {
    const reply = { ...fixture("tadawul-2222.json") } as Record<string, unknown>;
    delete reply.timestamp;
    reply.datetime = "yesterday";
    await expectUnavailable(fakeNetwork(reply).fetchFn, aramco, "no_data");
  });

  it("a vendor error sent inside a normal-looking reply", async () => {
    const { fetchFn } = fakeNetwork(fixture("error-bad-symbol.json"));
    const result = await expectUnavailable(fetchFn, aramco, "provider_error");
    // The vendor's own message text is not passed on.
    expect(JSON.stringify(result)).not.toContain("NOSUCH");
  });

  it("a rate-limited answer sent inside a normal-looking reply", async () => {
    await expectUnavailable(fakeNetwork(fixture("error-rate-limited.json")).fetchFn, aramco, "rate_limited");
  });

  it("an HTTP 429 rate-limited answer", async () => {
    await expectUnavailable(fakeNetwork("{}", 429).fetchFn, aramco, "rate_limited");
  });

  it("an HTTP 500 answer", async () => {
    await expectUnavailable(fakeNetwork("{}", 500).fetchFn, aramco, "provider_error");
  });

  it("a network failure", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expectUnavailable(fetchFn, aramco, "provider_error");
  });

  it("invalid JSON", async () => {
    await expectUnavailable(fakeNetwork("<html>not json</html>").fetchFn, aramco, "provider_error");
  });

  it("a reply that is not an object", async () => {
    await expectUnavailable(fakeNetwork([1, 2, 3]).fetchFn, aramco, "provider_error");
    await expectUnavailable(fakeNetwork("null").fetchFn, aramco, "provider_error");
  });

  it("everything except quotes is not supported", async () => {
    const { fetchFn, spy } = fakeNetwork(fixture("tadawul-2222.json"));
    const p = provider(fetchFn);
    const range = { from: new Date("2026-01-01"), to: new Date("2026-07-01") };
    const results = await Promise.all([
      p.getPriceHistory(aramco, range),
      p.getProfile(aramco),
      p.getFinancialStatements(aramco, "income", "annual"),
      p.getDividendHistory(aramco),
      p.getUpcomingDividends(aramco),
    ]);
    for (const result of results) {
      expect(!result.ok && result.unavailable).toBe("not_supported");
    }
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The key never leaks; the rate-limit stand-down
// ---------------------------------------------------------------------------

describe("the key never appears anywhere", () => {
  it("a thrown error containing the key shows up in no message and no log line", async () => {
    const logged: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
      });
    }
    const fetchFn = vi.fn(async (url: string) => {
      throw new Error(`connect ECONNREFUSED ${url} with header Authorization: apikey ${KEY}`);
    }) as unknown as typeof fetch;

    const result = await provider(fetchFn).getQuote(aramco);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(JSON.stringify(result)).not.toContain("twelvedata.com");
    expect(logged.join("\n")).not.toContain(KEY);
    expect(logged.join("\n")).not.toContain("twelvedata.com");
  });

  it("the facade passes the same guarantee on to the caller", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error(`boom ${KEY}`);
    }) as unknown as typeof fetch;
    const result = await getQuote(aramco, {
      store: makeStore(),
      fetchFn,
      twelveData: { apiKey: KEY },
      fmpApiKey: null,
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });
});

describe("rate-limit stand-down", () => {
  it("makes no calls for 60 seconds after a rate-limited answer, then tries again", async () => {
    let nowMs = 1_000_000;
    const limited = fakeNetwork("{}", 429);
    const p = provider(limited.fetchFn, { nowMs: () => nowMs });

    const first = await p.getQuote(aramco);
    expect(!first.ok && first.unavailable).toBe("rate_limited");
    expect(limited.spy).toHaveBeenCalledTimes(1);

    // Any stock, any market: no call while standing down.
    nowMs += TWELVE_DATA_STAND_DOWN_MS - 1;
    for (const instrument of [aramco, fab, qnbk]) {
      const during = await p.getQuote(instrument);
      expect(!during.ok && during.unavailable).toBe("rate_limited");
    }
    expect(limited.spy).toHaveBeenCalledTimes(1);

    // After the minute, one call goes out again.
    nowMs += 2;
    await p.getQuote(aramco);
    expect(limited.spy).toHaveBeenCalledTimes(2);
  });

  it("a rate limit reported inside a normal reply also starts the stand-down", async () => {
    let nowMs = 5_000_000;
    const limited = fakeNetwork(fixture("error-rate-limited.json"));
    const p = provider(limited.fetchFn, { nowMs: () => nowMs });
    await p.getQuote(aramco);
    nowMs += 10_000;
    await p.getQuote(fab);
    expect(limited.spy).toHaveBeenCalledTimes(1);
  });

  it("other failures do not start a stand-down", async () => {
    const broken = fakeNetwork("{}", 500);
    const p = provider(broken.fetchFn);
    await p.getQuote(aramco);
    await p.getQuote(aramco);
    expect(broken.spy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Cache + fallback through getQuote (the only door callers use)
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

function stored(source: PriceSource, ageMs: number, now: Date, price = 26.9) {
  const at = new Date(now.getTime() - ageMs);
  return {
    price,
    currency: "SAR" as const,
    asOf: at,
    source,
    fetchedAt: at,
  };
}

describe("getQuote for a Twelve Data stock", () => {
  const now = new Date("2026-09-28T13:00:00Z");
  const td = { apiKey: KEY };

  it("serves a fresh stored price (under 15 minutes) without any call", async () => {
    const { fetchFn, spy } = fakeNetwork(fixture("tadawul-2222.json"));
    const store = makeStore({
      getLatestPrice: vi.fn(async () => stored("TWELVE_DATA", 14 * 60 * 1000, now)),
    });
    const result = await getQuote(aramco, { store, fetchFn, now, twelveData: td, fmpApiKey: null });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.price).toBe(26.9);
      expect(result.data.priceSource).toBe("TWELVE_DATA");
      expect(result.data.fallback).toBeUndefined();
    }
    expect(spy).not.toHaveBeenCalled();
    expect(store.savePrice).not.toHaveBeenCalled();
  });

  it("an older stored price triggers exactly one call and saves the answer as TWELVE_DATA", async () => {
    const { fetchFn, spy } = fakeNetwork(fixture("tadawul-2222.json"));
    const store = makeStore({
      getLatestPrice: vi.fn(async () => stored("TWELVE_DATA", 16 * 60 * 1000, now)),
    });
    const result = await getQuote(aramco, { store, fetchFn, now, twelveData: td, fmpApiKey: null });
    expect(result.ok && result.data.price).toBe(27.45);
    expect(result.ok && result.data.priceSource).toBe("TWELVE_DATA");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(store.savePrice).toHaveBeenCalledTimes(1);
  });

  it("a stored sample or FMP price is never treated as a fresh Twelve Data answer", async () => {
    for (const source of ["SEED", "FMP", "MANUAL"] as const) {
      const { fetchFn, spy } = fakeNetwork(fixture("tadawul-2222.json"));
      const store = makeStore({ getLatestPrice: vi.fn(async () => stored(source, 60 * 1000, now)) });
      await getQuote(aramco, { store, fetchFn, now, twelveData: td, fmpApiKey: null });
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });

  it("the only thing this path writes to the shared price table is source TWELVE_DATA", async () => {
    const saved: { source: PriceSource }[] = [];
    const store = makeStore({
      savePrice: vi.fn(async (_id, entry) => {
        saved.push({ source: entry.source });
      }),
    });
    for (const [instrument, file] of [
      [aramco, "tadawul-2222.json"],
      [fab, "adx-fab.json"],
      [qnbk, "qse-qnbk.json"],
    ] as const) {
      const { fetchFn } = fakeNetwork(fixture(file));
      await getQuote(instrument, { store, fetchFn, now, twelveData: td, fmpApiKey: null });
    }
    expect(saved).toHaveLength(3);
    expect(saved.every((s) => s.source === "TWELVE_DATA")).toBe(true);
    // A failed call writes nothing at all.
    const failing = fakeNetwork("{}", 500);
    await getQuote(aramco, { store, fetchFn: failing.fetchFn, now, twelveData: td, fmpApiKey: null });
    expect(saved).toHaveLength(3);
  });

  it("provider down + older stored Twelve Data price: that price, its own date, fallback flag", async () => {
    const { fetchFn } = fakeNetwork("{}", 500);
    const oldRow = stored("TWELVE_DATA", 2 * 24 * 60 * 60 * 1000, now);
    const store = makeStore({ getLatestPrice: vi.fn(async () => oldRow) });
    const result = await getQuote(aramco, { store, fetchFn, now, twelveData: td, fmpApiKey: null });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.price).toBe(26.9);
      expect(result.data.asOf).toEqual(oldRow.asOf);
      expect(result.data.fallback).toBe(true);
      expect(result.data.priceSource).toBe("TWELVE_DATA");
    }
    expect(store.savePrice).not.toHaveBeenCalled();
  });

  it("provider down + nothing stored: the typed unavailable result", async () => {
    const { fetchFn } = fakeNetwork("{}", 500);
    const result = await getQuote(aramco, { store: makeStore(), fetchFn, now, twelveData: td, fmpApiKey: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.unavailable).toBe("provider_error");
  });

  it("a bad reply (wrong exchange) is never saved or shown; the stored price is used instead", async () => {
    const { fetchFn } = fakeNetwork({ ...fixture("tadawul-2222.json"), mic_code: "XNYS", exchange: "NYSE" });
    const store = makeStore({
      getLatestPrice: vi.fn(async () => stored("TWELVE_DATA", 3 * 60 * 60 * 1000, now)),
    });
    const result = await getQuote(aramco, { store, fetchFn, now, twelveData: td, fmpApiKey: null });
    expect(result.ok && result.data.price).toBe(26.9);
    expect(result.ok && result.data.fallback).toBe(true);
    expect(store.savePrice).not.toHaveBeenCalled();
  });

  it("price history for a Twelve Data stock comes from the stored prices, not the vendor", async () => {
    const { fetchFn, spy } = fakeNetwork(fixture("tadawul-2222.json"));
    const store = makeStore({
      getPriceHistory: vi.fn(async () => [stored("TWELVE_DATA", 24 * 60 * 60 * 1000, now)]),
    });
    const result = await getPriceHistory(
      aramco,
      { from: new Date("2026-09-01"), to: now },
      { store, fetchFn, now, twelveData: td, fmpApiKey: null },
    );
    expect(result.ok && result.data).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it("a stored Twelve Data price keeps its true origin after the key is removed", async () => {
    const row = stored("TWELVE_DATA", 60 * 60 * 1000, now);
    const manual = createManualProvider({
      getLatestPrice: async () => row,
      getPriceHistory: async () => [],
    });
    const result = await manual.getQuote(aramco);
    expect(result.ok && result.data.priceSource).toBe("TWELVE_DATA");
  });
});

// ---------------------------------------------------------------------------
// Alert engine records the true provider
// ---------------------------------------------------------------------------

describe("alert engine records the real provider", () => {
  const NOW = new Date("2026-09-28T13:00:00Z");

  async function fireOnce(quoteOverrides: Partial<Quote>) {
    const alert: AlertRecord = {
      id: "alert-1",
      userId: "user-1",
      kind: "PRICE_ABOVE",
      instrumentId: aramco.id,
      thesisId: null,
      threshold: 25,
      intervalDays: null,
      lastEvaluatedAt: null,
      lastTriggeredAt: null,
      instrument: aramco,
      thesis: null,
    };
    const fires: { price?: { source: PriceSource } }[] = [];
    const store: AlertStore = {
      findDueAlerts: async () => [alert],
      findTriggeredThesisAlerts: async () => [],
      latestThesisCheckAt: async () => null,
      previousClose: async () => null,
      recordNoFire: async () => undefined,
      recordFire: async (params) => {
        fires.push({ price: params.price });
      },
      rearmAlert: async () => undefined,
    };
    await sweepAlerts("all-users", {
      store,
      now: NOW,
      getQuoteFn: async () => ({
        ok: true,
        data: {
          price: 27.45,
          currency: "SAR",
          asOf: NOW,
          source: "live",
          fetchedAt: NOW,
          ...quoteOverrides,
        },
      }),
    });
    return fires;
  }

  it("a Twelve Data price is recorded as TWELVE_DATA, not FMP", async () => {
    const fires = await fireOnce({ priceSource: "TWELVE_DATA" });
    expect(fires).toHaveLength(1);
    expect(fires[0].price?.source).toBe("TWELVE_DATA");
  });

  it("an FMP price is still recorded as FMP", async () => {
    const fires = await fireOnce({ priceSource: "FMP" });
    expect(fires[0].price?.source).toBe("FMP");
  });

  it("an older-style quote with no origin keeps the old mapping (live means FMP)", async () => {
    const fires = await fireOnce({});
    expect(fires[0].price?.source).toBe("FMP");
  });

  it("a sample price still never fires", async () => {
    const fires = await fireOnce({ source: "sample", priceSource: "SEED" });
    expect(fires).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Public-display licence switch
// ---------------------------------------------------------------------------

describe("isPublicDisplayAllowed", () => {
  const sources: PriceSource[] = ["FMP", "TWELVE_DATA", "MANUAL", "SEED"];

  it("is false for every source by default", () => {
    for (const source of sources) {
      expect(isPublicDisplayAllowed(source, {} as NodeJS.ProcessEnv)).toBe(false);
    }
    // Reading the real environment gives the same answer in a clean test run.
    for (const source of sources) {
      expect(isPublicDisplayAllowed(source)).toBe(false);
    }
  });

  it("is true only for the source whose own flag is exactly \"true\"", () => {
    const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
    expect(isPublicDisplayAllowed("TWELVE_DATA", env({ TWELVE_DATA_PUBLIC_DISPLAY_LICENSED: "true" }))).toBe(true);
    expect(isPublicDisplayAllowed("FMP", env({ TWELVE_DATA_PUBLIC_DISPLAY_LICENSED: "true" }))).toBe(false);
    expect(isPublicDisplayAllowed("FMP", env({ FMP_PUBLIC_DISPLAY_LICENSED: "true" }))).toBe(true);
    expect(isPublicDisplayAllowed("TWELVE_DATA", env({ FMP_PUBLIC_DISPLAY_LICENSED: "true" }))).toBe(false);
    expect(isPublicDisplayAllowed("TWELVE_DATA", env({ TWELVE_DATA_PUBLIC_DISPLAY_LICENSED: "yes" }))).toBe(false);
    expect(isPublicDisplayAllowed("TWELVE_DATA", env({ TWELVE_DATA_PUBLIC_DISPLAY_LICENSED: "TRUE" }))).toBe(false);
  });

  it("typed-in and sample prices are never allowed, whatever is switched on", () => {
    const env = {
      TWELVE_DATA_PUBLIC_DISPLAY_LICENSED: "true",
      FMP_PUBLIC_DISPLAY_LICENSED: "true",
    } as unknown as NodeJS.ProcessEnv;
    expect(isPublicDisplayAllowed("MANUAL", env)).toBe(false);
    expect(isPublicDisplayAllowed("SEED", env)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Settings read from the environment
// ---------------------------------------------------------------------------

describe("environment settings", () => {
  const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

  it("TWELVE_DATA_BASE_URL is honoured outside production and ignored in production", () => {
    expect(twelveDataBaseUrlFromEnv(env({ TWELVE_DATA_BASE_URL: "http://127.0.0.1:4010", NODE_ENV: "development" }))).toBe(
      "http://127.0.0.1:4010",
    );
    expect(twelveDataBaseUrlFromEnv(env({ TWELVE_DATA_BASE_URL: "http://127.0.0.1:4010", NODE_ENV: "production" }))).toBeUndefined();
    expect(twelveDataBaseUrlFromEnv(env({ NODE_ENV: "development" }))).toBeUndefined();
  });

  it("the connection is configured only when a key is present", () => {
    expect(isTwelveDataConfigured(env({}))).toBe(false);
    expect(isTwelveDataConfigured(env({ TWELVE_DATA_API_KEY: "" }))).toBe(false);
    expect(isTwelveDataConfigured(env({ TWELVE_DATA_API_KEY: "   " }))).toBe(false);
    expect(isTwelveDataConfigured(env({ TWELVE_DATA_API_KEY: "k" }))).toBe(true);
  });

  it("the provider talks to the test server address it is given", async () => {
    const { fetchFn, calls } = fakeNetwork(fixture("adx-fab.json"));
    await createTwelveDataProvider({ apiKey: "fake-key", fetchFn, baseUrl: "http://127.0.0.1:4010" }).getQuote(fab);
    expect(calls[0].url.startsWith("http://127.0.0.1:4010/quote?")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Badge wording
// ---------------------------------------------------------------------------

describe("badge wording", () => {
  const asOf = new Date("2026-09-28T10:20:00Z"); // 14:20 in Gulf time (UTC+4)

  it("Tadawul says end of day with the date, and never the word Live", () => {
    const detail = describePriceProvider({ priceSource: "TWELVE_DATA", market: "TADAWUL", asOf });
    expect(detail?.text).toBe("Twelve Data · end of day, Sep 28, 2026");
    expect(detail?.text).not.toMatch(/live/i);
    expect(detail?.icon).toBe("clock");
    expect(detail?.fallbackNote).toBeNull();
  });

  it("an unconfirmed delay says delayed with the date and time, and never a number of minutes", () => {
    for (const market of ["ADX", "QSE", "DFM"] as const) {
      const detail = describePriceProvider({ priceSource: "TWELVE_DATA", market, asOf });
      expect(detail?.text).toBe("Twelve Data · delayed, as of Sep 28, 2026, 14:20");
      expect(detail?.text).not.toMatch(/min/i);
      expect(detail?.text).not.toMatch(/live/i);
      expect(detail?.icon).toBe("clock");
      expect(detail?.timeZoneNote).toBe("Times are in Gulf time (UTC+4).");
    }
  });

  it("a market with a confirmed delay in minutes says Live with the minutes and a green dot", () => {
    const entry = TWELVE_DATA_MARKET_TABLE.QSE!;
    const original = entry.delay;
    try {
      entry.delay = { kind: "minutes", minutes: 15 };
      const detail = describePriceProvider({ priceSource: "TWELVE_DATA", market: "QSE", asOf });
      expect(detail?.text).toBe("Live · Twelve Data · delayed 15 min");
      expect(detail?.icon).toBe("dot");
    } finally {
      entry.delay = original;
    }
  });

  it("the fallback wording mentions the date of the last stored price", () => {
    const old = new Date("2026-09-26T12:00:00Z");
    const detail = describePriceProvider({
      priceSource: "TWELVE_DATA",
      market: "ADX",
      asOf: old,
      fallback: true,
    });
    expect(detail?.fallbackNote).toBe(
      "Provider not responding. Showing the last price we have, from Sep 26, 2026.",
    );
    expect(detail?.text).toContain("Sep 26, 2026");
  });

  it("other sources keep their usual badges (no provider wording)", () => {
    for (const priceSource of ["FMP", "MANUAL", "SEED"] as const) {
      expect(describePriceProvider({ priceSource, market: "TADAWUL", asOf })).toBeNull();
    }
    expect(describePriceProvider({ priceSource: undefined, market: "TADAWUL", asOf })).toBeNull();
  });

  it("badge props: a Twelve Data quote gets detail; manual and sample stay as before", () => {
    const live = badgePropsForPrice({ source: "live", asOf, priceSource: "TWELVE_DATA" }, "ADX");
    expect(live.variant).toBe("live");
    expect(live.detail?.text).toContain("Twelve Data");

    expect(badgePropsForPrice({ source: "live", asOf, priceSource: "FMP" }, "US")).toEqual({ variant: "live" });
    expect(badgePropsForPrice({ source: "live", asOf }, "US")).toEqual({ variant: "live" });
    const manual = badgePropsForPrice({ source: "manual", asOf, priceSource: "MANUAL" }, "MSX");
    expect(manual.variant).toBe("manual");
    expect(manual.detail).toBeUndefined();
    expect(badgePropsForPrice({ source: "sample", asOf, priceSource: "SEED" }, "MSX")).toEqual({ variant: "sample" });
  });
});

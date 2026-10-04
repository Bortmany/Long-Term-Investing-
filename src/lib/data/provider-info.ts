// Pure facts about the Twelve Data connection — no network, no database.
//
// Three jobs live here, all of them plain decisions that are easy to test:
//   1. The per-market table (which vendor exchange code, which currency,
//      which ticker suffixes to strip, how late the price is).
//   2. Reading the optional settings (key, enabled markets, test-server URL).
//   3. The badge wording: "who supplied this price and how late is it".
//   4. The public-display licence check (for the future public stock pages).
//
// GOLDEN RULE: the badge wording never claims more than we know. Only a
// market whose delay is CONFIRMED in the table may name a number of minutes,
// and "Live" is never used for an end-of-day price.

import type { Currency, Market, PriceSource } from "@prisma/client";

// ---------------------------------------------------------------------------
// 1. The per-market table
// ---------------------------------------------------------------------------

/** How late a market's prices are. Only "minutes" may ever show a number. */
export type TwelveDataDelay =
  | { kind: "end_of_day" }
  | { kind: "minutes"; minutes: number }
  | { kind: "unconfirmed" };

export type TwelveDataMarketEntry = {
  market: Market;
  /** The vendor's exchange code. A reply from any other exchange is refused. */
  exchange: string;
  /** The currency the vendor quotes in. A reply in any other currency is refused. */
  currency: Currency;
  /** Trailing ticker suffixes to remove before asking the vendor (upper case). */
  stripSuffixes: readonly string[];
  delay: TwelveDataDelay;
};

// EVERY ROW BELOW IS "UNVERIFIED until first real call": the values come from
// the owner's decision note (docs/decisions/gulf-data-provider.md) only —
// nobody has seen a real Twelve Data reply yet (no key exists). The owner's
// day-one check in GO-LIVE.md is: make one real call per market and correct
// this table (exchange codes, suffixes, delay text) from what comes back.
export const TWELVE_DATA_MARKET_TABLE: Partial<Record<Market, TwelveDataMarketEntry>> = {
  // UNVERIFIED until first real call. Aramco's demo ticker is "2222.SR";
  // the vendor wants "2222". The decision note says end of day only.
  TADAWUL: {
    market: "TADAWUL",
    exchange: "XSAU",
    currency: "SAR",
    stripSuffixes: [".SR"],
    delay: { kind: "end_of_day" },
  },
  // UNVERIFIED until first real call. Suffix is a conservative guess.
  ADX: {
    market: "ADX",
    exchange: "XADS",
    currency: "AED",
    stripSuffixes: [".AD"],
    delay: { kind: "unconfirmed" },
  },
  // UNVERIFIED until first real call. Suffix is a conservative guess.
  QSE: {
    market: "QSE",
    exchange: "DSMD",
    currency: "QAR",
    stripSuffixes: [".QA"],
    delay: { kind: "unconfirmed" },
  },
  // UNVERIFIED until first real call. Needs Twelve Data's dearer plan, so it
  // is OFF unless named in TWELVE_DATA_MARKETS.
  DFM: {
    market: "DFM",
    exchange: "XDFM",
    currency: "AED",
    stripSuffixes: [".AE", ".DU"],
    delay: { kind: "unconfirmed" },
  },
};
// MSX, US and OTHER are deliberately NOT in the table: MSX has no data vendor
// anywhere (typed-in prices only), US uses FMP, OTHER is always typed-in.

export function getTwelveDataMarketEntry(market: Market): TwelveDataMarketEntry | null {
  return TWELVE_DATA_MARKET_TABLE[market] ?? null;
}

/**
 * The ticker the vendor expects: trimmed, upper case, and one trailing
 * exchange suffix removed if the table lists it ("2222.SR" becomes "2222").
 * Returns null when what is left does not look like a plain ticker, so odd
 * input is never sent to the vendor.
 */
export function vendorSymbolFor(market: Market, ticker: string): string | null {
  const entry = getTwelveDataMarketEntry(market);
  if (!entry) return null;
  let symbol = ticker.trim().toUpperCase();
  for (const suffix of entry.stripSuffixes) {
    if (symbol.endsWith(suffix) && symbol.length > suffix.length) {
      symbol = symbol.slice(0, -suffix.length);
      break;
    }
  }
  return /^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(symbol) ? symbol : null;
}

// ---------------------------------------------------------------------------
// 2. Settings read from the environment
// ---------------------------------------------------------------------------

/** Markets sent to Twelve Data when TWELVE_DATA_MARKETS is not set. DFM is left out on purpose. */
export const DEFAULT_TWELVE_DATA_MARKETS: readonly Market[] = ["TADAWUL", "ADX", "QSE"];

/**
 * Turns "TADAWUL, adx" into a market list. Only markets that are in the
 * table can ever be on (so "MSX" or "OTHER" in the setting does nothing).
 * Empty or missing means the default list.
 */
export function parseTwelveDataMarkets(raw: string | null | undefined): Market[] {
  if (!raw || raw.trim() === "") return [...DEFAULT_TWELVE_DATA_MARKETS];
  const named = raw
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part.length > 0);
  return Object.keys(TWELVE_DATA_MARKET_TABLE).filter((market) =>
    named.includes(market),
  ) as Market[];
}

export type TwelveDataRouting = {
  apiKey: string | null | undefined;
  /** Markets switched on. Defaults to TADAWUL, ADX and QSE. */
  markets?: readonly Market[];
};

/** The Twelve Data settings as the server sees them right now. */
export function twelveDataRoutingFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { apiKey: string | null; markets: Market[] } {
  return {
    apiKey: env.TWELVE_DATA_API_KEY?.trim() || null,
    markets: parseTwelveDataMarkets(env.TWELVE_DATA_MARKETS),
  };
}

/** True when a key is present — the only thing that wakes the connection up. */
export function isTwelveDataConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TWELVE_DATA_API_KEY?.trim());
}

/**
 * Developer-only: lets the adapter talk to scripts/fake-twelve-data.mjs.
 * Ignored completely when NODE_ENV is "production", so a stray setting on
 * the live site can never redirect where prices come from.
 */
export function twelveDataBaseUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env.NODE_ENV === "production") return undefined;
  const url = env.TWELVE_DATA_BASE_URL?.trim();
  return url ? url : undefined;
}

// ---------------------------------------------------------------------------
// 3. Badge wording
// ---------------------------------------------------------------------------

/** Plain, serialisable description of a provider price for the source badge. */
export type ProviderBadgeDetail = {
  /** The pill text, e.g. "Twelve Data · end of day, Sep 28, 2026". */
  text: string;
  /** One plain sentence saying what the wording means (shown in the hint). */
  meaning: string;
  /** Green dot only for a confirmed short delay; otherwise a clock. */
  icon: "dot" | "clock";
  /** Set when the provider did not answer and a stored price is shown. */
  fallbackNote: string | null;
  /** Extra hint line, only when the text contains a clock time. */
  timeZoneNote: string | null;
};

// Gulf time is fixed at UTC+4 all year (no daylight saving), so Asia/Dubai
// gives the right day and clock time for every Gulf market.
const GULF_TIME_ZONE = "Asia/Dubai";

function gulfDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: GULF_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function gulfTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: GULF_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Who supplied this price and how late it is. Returns null for anything that
 * is not a Twelve Data price — FMP, manual and sample badges keep their
 * existing wording.
 */
export function describePriceProvider(input: {
  priceSource: PriceSource | null | undefined;
  market: Market;
  /** When the price is FOR (the stored/quoted as-of moment). */
  asOf: Date;
  /** True when the provider did not answer and this is the newest stored copy. */
  fallback?: boolean;
}): ProviderBadgeDetail | null {
  if (input.priceSource !== "TWELVE_DATA") return null;

  const delay: TwelveDataDelay =
    getTwelveDataMarketEntry(input.market)?.delay ?? { kind: "unconfirmed" };
  const date = gulfDate(input.asOf);

  let text: string;
  let meaning: string;
  let icon: ProviderBadgeDetail["icon"] = "clock";
  let timeZoneNote: string | null = null;

  if (delay.kind === "end_of_day") {
    text = `Twelve Data · end of day, ${date}`;
    meaning = "This is the closing price from the last trading day.";
  } else if (delay.kind === "minutes") {
    text = `Live · Twelve Data · delayed ${delay.minutes} min`;
    meaning = `This price is about ${delay.minutes} minutes behind the market.`;
    icon = "dot";
  } else {
    // Delay not confirmed: say "delayed", give the price's own date and time,
    // and NEVER a number of minutes we do not know.
    text = `Twelve Data · delayed, as of ${date}, ${gulfTime(input.asOf)}`;
    meaning =
      "This price may be behind the market. The provider hasn't told us by how much.";
    timeZoneNote = "Times are in Gulf time (UTC+4).";
  }

  return {
    text,
    meaning,
    icon,
    timeZoneNote,
    fallbackNote: input.fallback
      ? `Provider not responding. Showing the last price we have, from ${date}.`
      : null,
  };
}

// ---------------------------------------------------------------------------
// 4. Public-display licence check (Step 7 will call this; nothing does yet)
// ---------------------------------------------------------------------------

/**
 * May a price from this source appear on a signed-out page?
 * Default answer is NO. Only TWELVE_DATA (with
 * TWELVE_DATA_PUBLIC_DISPLAY_LICENSED="true") and FMP (with
 * FMP_PUBLIC_DISPLAY_LICENSED="true") can ever say yes. MANUAL is one
 * person's private data and SEED is sample data — both always no.
 */
export function isPublicDisplayAllowed(
  priceSource: PriceSource,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  switch (priceSource) {
    case "TWELVE_DATA":
      return env.TWELVE_DATA_PUBLIC_DISPLAY_LICENSED === "true";
    case "FMP":
      return env.FMP_PUBLIC_DISPLAY_LICENSED === "true";
    case "MANUAL":
    case "SEED":
      return false;
  }
}

// The PUBLIC LIST: the only stocks that get a signed-out page at
// /s/<MARKET>/<TICKER> and an entry in /sitemap.xml.
//
// It lives in code (not in the shared Instrument table) on purpose: that table
// is partly typed in by users, so "a row exists" can never mean "safe to
// publish". The words below (name, sector, country) are what the world sees,
// so the owner reviews this list before launch. Adding a stock is one line;
// then run `npm run catalogue:sync` so the matching database row exists.
//
// Pure data and pure functions, plus ONE shared "list + database" rule
// (`resolvePublicStocks`) used by both the page and the sitemap so the two can
// never disagree. Only TYPES come from the database client, so this file is
// safe anywhere.

import type { Currency, InstrumentType, Market } from "@prisma/client";

export type PublicEntry = {
  market: Market;
  ticker: string;
  name: string;
  type: InstrumentType;
  sector: string;
  country: string;
  currency: Currency;
};

// The nine sample stocks (same facts as prisma/seed-demo.ts). Keep in sync.
export const PUBLIC_CATALOGUE: readonly PublicEntry[] = [
  { market: "US", ticker: "AAPL", name: "Apple Inc.", type: "STOCK", sector: "Technology", country: "United States", currency: "USD" },
  { market: "US", ticker: "MSFT", name: "Microsoft Corporation", type: "STOCK", sector: "Technology", country: "United States", currency: "USD" },
  { market: "US", ticker: "KO", name: "The Coca-Cola Company", type: "STOCK", sector: "Consumer Staples", country: "United States", currency: "USD" },
  { market: "US", ticker: "O", name: "Realty Income Corporation", type: "REIT", sector: "Real Estate", country: "United States", currency: "USD" },
  { market: "US", ticker: "JNJ", name: "Johnson & Johnson", type: "STOCK", sector: "Healthcare", country: "United States", currency: "USD" },
  { market: "MSX", ticker: "BKMB", name: "Bank Muscat", type: "STOCK", sector: "Banks", country: "Oman", currency: "OMR" },
  { market: "TADAWUL", ticker: "2222.SR", name: "Saudi Aramco", type: "STOCK", sector: "Energy", country: "Saudi Arabia", currency: "SAR" },
  { market: "ADX", ticker: "FAB", name: "First Abu Dhabi Bank", type: "STOCK", sector: "Banks", country: "United Arab Emirates", currency: "AED" },
  { market: "QSE", ticker: "QNBK", name: "Qatar National Bank", type: "STOCK", sector: "Banks", country: "Qatar", currency: "QAR" },
];

/** Letters, digits, dot and dash only: safe to put in an address. */
export function isUrlSafeTicker(ticker: string): boolean {
  return /^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(ticker);
}

/** The one official address of a public stock, e.g. "/s/TADAWUL/2222.SR". */
export function publicPath(entry: Pick<PublicEntry, "market" | "ticker">): string {
  return `/s/${entry.market}/${entry.ticker}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Look a stock up in the public list. EXACT (capital-letter) match only:
 * this is a pure list check with no database, so a crawler guessing random
 * addresses costs almost nothing.
 */
export function findPublicEntry(market: string, ticker: string): PublicEntry | null {
  const m = safeDecode(market);
  const t = safeDecode(ticker);
  return (
    PUBLIC_CATALOGUE.find((entry) => entry.market === m && entry.ticker === t) ?? null
  );
}

/**
 * Same lookup ignoring letter case. Used only to decide whether a request in
 * the wrong case should be redirected to the official capital-letter address.
 */
export function findPublicEntryIgnoringCase(
  market: string,
  ticker: string,
): PublicEntry | null {
  const m = safeDecode(market).toUpperCase();
  const t = safeDecode(ticker).toUpperCase();
  return (
    PUBLIC_CATALOGUE.find((entry) => entry.market === m && entry.ticker === t) ?? null
  );
}

/** The smallest slice of the database this rule needs (easy to fake in tests). */
export type PublicInstrumentSource = {
  instrument: {
    findMany(args: {
      where: { OR: { ticker: string; market: Market }[] };
      select: { id: true; ticker: true; market: true; currency: true };
    }): Promise<{ id: string; ticker: string; market: Market; currency: Currency }[]>;
  };
};

export type ResolvedPublicStock = { entry: PublicEntry; instrumentId: string };

/**
 * THE rule: a stock is public only if it is on the list AND a matching
 * Instrument row exists whose currency equals the list's currency (a guard
 * against someone having created the same ticker with the wrong currency).
 * One small query; used by the page and the sitemap.
 */
export async function resolvePublicStocks(
  db: PublicInstrumentSource,
  only?: PublicEntry,
): Promise<ResolvedPublicStock[]> {
  const wanted = only ? [only] : PUBLIC_CATALOGUE;
  const rows = await db.instrument.findMany({
    where: { OR: wanted.map((e) => ({ ticker: e.ticker, market: e.market })) },
    select: { id: true, ticker: true, market: true, currency: true },
  });
  const resolved: ResolvedPublicStock[] = [];
  for (const entry of wanted) {
    const row = rows.find((r) => r.ticker === entry.ticker && r.market === entry.market);
    if (row && row.currency === entry.currency) {
      resolved.push({ entry, instrumentId: row.id });
    }
  }
  return resolved;
}

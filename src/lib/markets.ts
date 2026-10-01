// The ONE place that knows which markets and currencies InvestIQ supports:
// the order they appear in, their on-screen names, and the currency each
// market normally trades in. Dropdowns, error messages and the CSV import
// presets all read from here so adding a market later means editing one file.
//
// Safety net: each table below is a `Record<Market, ...>` / `Record<Currency, ...>`,
// so if someone adds a value to the database list and forgets it here, the
// code stops compiling. tests/unit/markets.test.ts checks the same thing.
//
// Only TYPES are imported from the database client, so this file is safe to
// use inside browser components too.

import type { Currency, Market } from "@prisma/client";

type MarketInfo = {
  /** Where it sits in every list (1 = first). */
  rank: number;
  /** The name shown in dropdowns. */
  label: string;
  /** A sensible currency to pre-select when the user picks this market. */
  defaultCurrency: Currency;
};

const MARKET_INFO: Record<Market, MarketInfo> = {
  US: { rank: 1, label: "US", defaultCurrency: "USD" },
  MSX: { rank: 2, label: "MSX (Muscat)", defaultCurrency: "OMR" },
  TADAWUL: { rank: 3, label: "Tadawul (Saudi)", defaultCurrency: "SAR" },
  DFM: { rank: 4, label: "DFM (Dubai)", defaultCurrency: "AED" },
  ADX: { rank: 5, label: "ADX (Abu Dhabi)", defaultCurrency: "AED" },
  QSE: { rank: 6, label: "QSE (Qatar)", defaultCurrency: "QAR" },
  OTHER: { rank: 7, label: "Other", defaultCurrency: "USD" },
};

const CURRENCY_RANK: Record<Currency, number> = {
  OMR: 1,
  USD: 2,
  SAR: 3,
  AED: 4,
  QAR: 5,
};

/** Every market, in display order: US, MSX, TADAWUL, DFM, ADX, QSE, OTHER. */
export const MARKET_VALUES: readonly Market[] = (
  Object.keys(MARKET_INFO) as Market[]
).sort((a, b) => MARKET_INFO[a].rank - MARKET_INFO[b].rank);

/** Every currency, in display order: OMR, USD, SAR, AED, QAR. */
export const CURRENCY_VALUES: readonly Currency[] = (
  Object.keys(CURRENCY_RANK) as Currency[]
).sort((a, b) => CURRENCY_RANK[a] - CURRENCY_RANK[b]);

/** The on-screen name of a market, e.g. "Tadawul (Saudi)". */
export function marketLabel(market: Market): string {
  return MARKET_INFO[market].label;
}

/** The currency to pre-select for a market (the user can still change it). */
export function defaultCurrencyForMarket(market: Market): Currency {
  return MARKET_INFO[market].defaultCurrency;
}

/** Sort any list of markets into the standard display order. */
export function sortMarkets(markets: readonly Market[]): Market[] {
  return [...markets].sort((a, b) => MARKET_INFO[a].rank - MARKET_INFO[b].rank);
}

/** Sort any list of currencies into the standard display order. */
export function sortCurrencies(currencies: readonly Currency[]): Currency[] {
  return [...currencies].sort((a, b) => CURRENCY_RANK[a] - CURRENCY_RANK[b]);
}

/** True when the text is exactly a real market code such as "ADX" (used by CSV presets). */
export function isMarketValue(value: string): value is Market {
  return Object.prototype.hasOwnProperty.call(MARKET_INFO, value);
}

/** True when the text is exactly a real currency code such as "QAR". */
export function isCurrencyValue(value: string): value is Currency {
  return Object.prototype.hasOwnProperty.call(CURRENCY_RANK, value);
}

function joinWithOr(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/** "Pick a valid currency (OMR, USD, SAR, AED or QAR)." */
export function currencyListSentence(): string {
  return `Pick a valid currency (${joinWithOr(CURRENCY_VALUES)}).`;
}

/** "Pick a market (US, MSX, TADAWUL, DFM, ADX, QSE or OTHER)." */
export function marketListSentence(): string {
  return `Pick a market (${joinWithOr(MARKET_VALUES)}).`;
}

/** "OMR, USD, SAR, AED or QAR" — for use inside other sentences. */
export function currencyListText(): string {
  return joinWithOr(CURRENCY_VALUES);
}

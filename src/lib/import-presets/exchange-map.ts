// Broker exchange words -> the app's market names.
//
// This table only TRANSLATES what a broker writes (exchange codes such as
// XNAS, or labels such as "NASDAQ") into a market name. It does not decide
// which markets exist: every name is checked against the app's real market
// list at run time (see lists.ts) and ignored when the app does not have it
// yet. So adding a market to the app never needs an edit in any preset, and
// a market that is not in the app yet simply gives "no hint".

import { realMarketNames } from "./lists";

// Keys are upper-case. Values are market names as the app spells them.
const EXCHANGE_WORDS: Record<string, string> = {
  // United States
  XNAS: "US",
  XNYS: "US",
  XASE: "US",
  ARCX: "US",
  BATS: "US",
  XBATS: "US",
  NASDAQ: "US",
  NYSE: "US",
  AMEX: "US",
  "NYSE ARCA": "US",
  NYSEARCA: "US",
  "NYSE AMERICAN": "US",
  US: "US",
  USA: "US",
  // Oman
  XMUS: "MSX",
  MSM: "MSX",
  MSX: "MSX",
  // Saudi Arabia
  XSAU: "TADAWUL",
  TADAWUL: "TADAWUL",
  SAU: "TADAWUL",
  // Dubai
  XDFM: "DFM",
  DFM: "DFM",
  // Abu Dhabi
  XADS: "ADX",
  ADX: "ADX",
  // Qatar
  DSMD: "QSE",
  XDSM: "QSE",
  QSE: "QSE",
};

/**
 * Translate a broker's exchange word into a market name, or undefined when
 * the word is unknown or the app does not have that market (yet).
 */
export function translateExchange(word: string | undefined): string | undefined {
  if (!word) return undefined;
  const key = word.trim().toUpperCase().replace(/\s+/g, " ");
  if (key === "") return undefined;
  const market = EXCHANGE_WORDS[key];
  if (!market) return undefined;
  return realMarketNames().includes(market) ? market : undefined;
}

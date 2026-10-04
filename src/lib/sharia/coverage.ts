// The ONE list of exchanges the screening supplier covers, by market name.
// Musaffa's plan covers the US, Saudi and the UAE (Dubai and Abu Dhabi).
// Muscat (MSX) and Qatar (QSE) have no coverage, so they show "Not screened".
// UNVERIFIED AGAINST THE REAL PLAN: the owner confirms the covered list in
// writing before the key is set (see GO-LIVE.md); fix it here if it differs.
//
// Keyed by market NAME (text) so it never depends on the database enum.

export const COVERED_MARKETS: readonly string[] = ["US", "TADAWUL", "DFM", "ADX"];

export function isCoveredMarket(market: string): boolean {
  return COVERED_MARKETS.includes(market);
}

/** Market names as people read them in the "not covered" sentence. */
const EXCHANGE_NAMES: Record<string, string> = {
  US: "New York",
  MSX: "Muscat",
  TADAWUL: "Tadawul",
  DFM: "Dubai",
  ADX: "Abu Dhabi",
  QSE: "Qatar",
  OTHER: "other-market",
};

export function exchangeName(market: string): string {
  return EXCHANGE_NAMES[market] ?? "other-market";
}

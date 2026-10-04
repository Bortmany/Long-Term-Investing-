// Stock search on /stocks (?q=). Pure: builds what the search may look at and
// what it must match. Scope is the owner's PUBLIC LIST plus the stocks THIS
// user holds or watches. It never reaches other people's typed-in tickers,
// because the shared Instrument table is partly user-typed text.
//
// The caller passes the ids of the signed-in user's own stocks (read with the
// session user id, never from client input).

import type { Currency, Market } from "@prisma/client";

import { PUBLIC_CATALOGUE } from "@/lib/public-catalogue";

export const SEARCH_MAX_QUERY_LENGTH = 60;
export const SEARCH_MAX_RESULTS = 20;

/** Trim, cap at 60 characters; an empty or all-spaces query means "no search". */
export function normalizeSearchQuery(raw: string | string[] | undefined | null): string | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== "string") return null;
  const trimmed = first.trim().slice(0, SEARCH_MAX_QUERY_LENGTH).trim();
  return trimmed === "" ? null : trimmed;
}

export type StockSearchWhere = {
  AND: [
    { OR: ({ id: { in: string[] } } | { ticker: string; market: Market; currency: Currency })[] },
    {
      OR: (
        | { ticker: { contains: string; mode: "insensitive" } }
        | { name: { contains: string; mode: "insensitive" } }
      )[];
    },
  ];
};

/** The database filter: (public list OR this user's own stocks) AND (ticker or name matches). */
export function buildStockSearchWhere(
  query: string,
  ownedInstrumentIds: readonly string[],
): StockSearchWhere {
  return {
    AND: [
      {
        OR: [
          { id: { in: [...ownedInstrumentIds] } },
          ...PUBLIC_CATALOGUE.map((e) => ({ ticker: e.ticker, market: e.market, currency: e.currency })),
        ],
      },
      {
        OR: [
          { ticker: { contains: query, mode: "insensitive" as const } },
          { name: { contains: query, mode: "insensitive" as const } },
        ],
      },
    ],
  };
}

/** Plain-English results line: `3 results for "johnson"`. */
export function resultsLine(count: number, query: string): string {
  return `${count} result${count === 1 ? "" : "s"} for "${query}"`;
}

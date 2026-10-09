// Which instruments a signed-in person may SEE. The Instrument table is shared
// and partly typed in by users (a made-up or private ticker is a row there), so
// no screen may list every row. One rule, used by every dropdown, picker and
// the stock detail page:
//
//   visible = the owner's public list  +  instruments THIS user references
//             (their transactions, watchlist, theses, alerts, AI analyses).
//
// This is the same scope as the Stocks search (`buildStockSearchWhere`).
// The user id always comes from the server session, never from the browser.

import type { Currency, Instrument, Market } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { PUBLIC_CATALOGUE } from "@/lib/public-catalogue";

export type VisibleInstrumentWhere = {
  OR: (
    | { id: { in: string[] } }
    | { ticker: string; market: Market; currency: Currency }
  )[];
};

/** The database filter for "public list OR one of this user's own stocks". */
export function buildVisibleInstrumentWhere(
  ownedInstrumentIds: readonly string[],
): VisibleInstrumentWhere {
  return {
    OR: [
      { id: { in: [...ownedInstrumentIds] } },
      ...PUBLIC_CATALOGUE.map((e) => ({
        ticker: e.ticker,
        market: e.market,
        currency: e.currency,
      })),
    ],
  };
}

type IdRow = { instrumentId: string | null };

/** The small slice of the database client this file needs (so tests can fake it). */
export type VisibleInstrumentDb = {
  transaction: { findMany(args: object): Promise<IdRow[]> };
  watchlistItem: { findMany(args: object): Promise<IdRow[]> };
  thesis: { findMany(args: object): Promise<IdRow[]> };
  alert: { findMany(args: object): Promise<IdRow[]> };
  aiAnalysis: { findMany(args: object): Promise<{ subjectId: string }[]> };
  instrument: {
    findMany(args: object): Promise<Instrument[]>;
    findFirst(args: object): Promise<Instrument | null>;
  };
};

/** Ids of every instrument this user references anywhere. */
export async function getUserInstrumentIds(
  userId: string,
  db: VisibleInstrumentDb = prisma as unknown as VisibleInstrumentDb,
): Promise<string[]> {
  const [transactions, watchlist, theses, alerts, analyses] = await Promise.all([
    db.transaction.findMany({
      where: { portfolio: { userId }, instrumentId: { not: null } },
      select: { instrumentId: true },
      distinct: ["instrumentId"],
    }),
    db.watchlistItem.findMany({ where: { userId }, select: { instrumentId: true } }),
    db.thesis.findMany({ where: { userId }, select: { instrumentId: true } }),
    db.alert.findMany({
      where: { userId, instrumentId: { not: null } },
      select: { instrumentId: true },
    }),
    db.aiAnalysis.findMany({
      where: { userId, subjectType: "instrument" },
      select: { subjectId: true },
      distinct: ["subjectId"],
    }),
  ]);
  const ids = new Set<string>();
  for (const row of [...transactions, ...watchlist, ...theses, ...alerts]) {
    if (row.instrumentId) ids.add(row.instrumentId);
  }
  for (const row of analyses) ids.add(row.subjectId);
  return [...ids];
}

/** Every instrument this user may see, by ticker. Use for every dropdown/picker. */
export async function listVisibleInstruments(
  userId: string,
  db: VisibleInstrumentDb = prisma as unknown as VisibleInstrumentDb,
): Promise<Instrument[]> {
  const owned = await getUserInstrumentIds(userId, db);
  return db.instrument.findMany({
    where: buildVisibleInstrumentWhere(owned),
    orderBy: { ticker: "asc" },
  });
}

/** One instrument if this user may see it, otherwise null (treat as not found). */
export async function getVisibleInstrument(
  userId: string,
  instrumentId: string,
  db: VisibleInstrumentDb = prisma as unknown as VisibleInstrumentDb,
): Promise<Instrument | null> {
  const owned = await getUserInstrumentIds(userId, db);
  return db.instrument.findFirst({
    where: { AND: [{ id: instrumentId }, buildVisibleInstrumentWhere(owned)] },
  });
}

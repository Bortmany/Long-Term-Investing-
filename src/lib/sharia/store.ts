// The database side of the Sharia screen. ShariaScreen is SHARED reference
// data: nothing in it is about a person, so the read takes NO user id. The
// per-user part (the on/off preference) lives on the user row.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StoredShariaScreen } from "./types";
import type { VendorResult } from "./vendor";

export type RefreshCandidate = {
  id: string;
  ticker: string;
  market: string;
  /** The stored row for the active supplier, if any. */
  existing: { fetchedAt: Date; asOf: Date } | null;
};

export type ShariaStore = {
  /** True when at least one user has the switch on. */
  anyoneEnabled(): Promise<boolean>;
  /** Stocks held or watched by switched-on users (all-users), or by one user. */
  listCandidates(scope: "all-users" | { userId: string }, source: string): Promise<RefreshCandidate[]>;
  save(
    instrumentId: string,
    source: string,
    result: Extract<VendorResult, { kind: "verdict" }>,
    fetchedAt: Date,
  ): Promise<void>;
  remove(instrumentId: string, source: string): Promise<void>;
};

export const prismaShariaStore: ShariaStore = {
  async anyoneEnabled() {
    const row = await prisma.user.findFirst({
      where: { shariaScreenEnabled: true },
      select: { id: true },
    });
    return row !== null;
  },

  async listCandidates(scope, source) {
    const owner =
      scope === "all-users"
        ? {
            OR: [
              { transactions: { some: { portfolio: { user: { shariaScreenEnabled: true } } } } },
              { watchlistItems: { some: { user: { shariaScreenEnabled: true } } } },
            ],
          }
        : {
            OR: [
              { transactions: { some: { portfolio: { userId: scope.userId } } } },
              { watchlistItems: { some: { userId: scope.userId } } },
            ],
          };
    const rows = await prisma.instrument.findMany({
      where: owner,
      select: {
        id: true,
        ticker: true,
        market: true,
        shariaScreens: { where: { source }, select: { fetchedAt: true, asOf: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      ticker: row.ticker,
      market: row.market,
      existing: row.shariaScreens[0] ?? null,
    }));
  },

  async save(instrumentId, source, result, fetchedAt) {
    const data = {
      verdict: result.verdict,
      methodName: result.methodName,
      methodVersion: result.methodVersion,
      ratios: result.ratios ?? Prisma.JsonNull,
      asOf: result.asOf,
      fetchedAt,
    };
    await prisma.shariaScreen.upsert({
      where: { instrumentId_source: { instrumentId, source } },
      create: { instrumentId, source, ...data },
      update: data,
    });
  },

  async remove(instrumentId, source) {
    await prisma.shariaScreen.deleteMany({ where: { instrumentId, source } });
  },
};

/**
 * Read stored rows for some instruments from ONE supplier. Takes no user id on
 * purpose: verdicts are shared. Ratios are not selected (stored, never shown).
 */
export async function readShariaScreens(
  instrumentIds: string[],
  source: string,
): Promise<Map<string, StoredShariaScreen>> {
  if (instrumentIds.length === 0) return new Map();
  const rows = await prisma.shariaScreen.findMany({
    where: { instrumentId: { in: instrumentIds }, source },
    select: {
      instrumentId: true,
      verdict: true,
      source: true,
      methodName: true,
      methodVersion: true,
      asOf: true,
      fetchedAt: true,
    },
  });
  return new Map(
    rows.map((row) => [
      row.instrumentId,
      {
        verdict: row.verdict,
        source: row.source,
        methodName: row.methodName,
        methodVersion: row.methodVersion,
        asOf: row.asOf,
        fetchedAt: row.fetchedAt,
      },
    ]),
  );
}

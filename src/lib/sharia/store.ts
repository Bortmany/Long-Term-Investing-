// The database side of the Sharia screen. ShariaScreen is SHARED reference
// data: nothing in it is about a person, so the read takes NO user id. The
// per-user part (the on/off preference) lives on the user row.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveEffectivePlan } from "@/lib/plan-access";
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
  /** True when at least one user is Pro AND has the switch on. */
  anyoneEnabled(): Promise<boolean>;
  /** Stocks held or watched by Pro users with the switch on (all-users), or by one user. */
  listCandidates(scope: "all-users" | { userId: string }, source: string): Promise<RefreshCandidate[]>;
  save(
    instrumentId: string,
    source: string,
    result: Extract<VendorResult, { kind: "verdict" }>,
    fetchedAt: Date,
  ): Promise<void>;
  remove(instrumentId: string, source: string): Promise<void>;
};

/** The slice of the database client the store uses (lets tests pass a pretend one). */
export type ShariaDb = Pick<typeof prisma, "user" | "instrument" | "shariaScreen">;

/**
 * Users the daily refresh is for: switch ON and Pro right now. Reads switched-on
 * users with their subscription, then asks `resolveEffectivePlan` (owner-granted
 * Pro, active/trialing/past-due with grace, or a cancelled period not yet ended).
 * Ids only; nothing about the person leaves this function.
 */
export async function listEligibleUserIds(db: ShariaDb, now: Date): Promise<string[]> {
  const users = await db.user.findMany({
    where: { shariaScreenEnabled: true },
    select: {
      id: true,
      plan: true,
      subscription: { select: { status: true, currentPeriodEnd: true, providerSubscriptionId: true } },
    },
  });
  return users
    .filter((u) => resolveEffectivePlan({ plan: u.plan, subscription: u.subscription, now }) === "PRO")
    .map((u) => u.id);
}

export function createShariaStore(db: ShariaDb, clock: () => Date = () => new Date()): ShariaStore {
  return {
    async anyoneEnabled() {
      return (await listEligibleUserIds(db, clock())).length > 0;
    },

    async listCandidates(scope, source) {
      let owner: Prisma.InstrumentWhereInput;
      if (scope === "all-users") {
        const userIds = await listEligibleUserIds(db, clock());
        if (userIds.length === 0) return [];
        owner = {
          OR: [
            { transactions: { some: { portfolio: { userId: { in: userIds } } } } },
            { watchlistItems: { some: { userId: { in: userIds } } } },
          ],
        };
      } else {
        owner = {
          OR: [
            { transactions: { some: { portfolio: { userId: scope.userId } } } },
            { watchlistItems: { some: { userId: scope.userId } } },
          ],
        };
      }
      const rows = await db.instrument.findMany({
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
      await db.shariaScreen.upsert({
        where: { instrumentId_source: { instrumentId, source } },
        create: { instrumentId, source, ...data },
        update: data,
      });
    },

    async remove(instrumentId, source) {
      await db.shariaScreen.deleteMany({ where: { instrumentId, source } });
    },
  };
}

export const prismaShariaStore: ShariaStore = createShariaStore(prisma);

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

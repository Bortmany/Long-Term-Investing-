// The ONE place imported rows are validated, locked, checked for oversells and
// written. Used by the CSV/file import action (no stamp) and by the broker
// sync (stamped "synced from" + the sync run). There is no second copy of
// these rules: a synced row can never be looser than a hand-imported one.
//
// Server-side only (not a "use server" file, so it is not callable from the
// browser). Callers pass the user id from the SESSION.

import { prisma } from "@/lib/prisma";
import {
  findImportOversell,
  toTransactionRecord,
  validateMappedRows,
  type KnownInstrument,
  type MappedImportRow,
} from "@/lib/import-rows";
import { computeHoldings, fromPrismaTransaction } from "@/lib/portfolio";
import { lockPortfolioForWrite } from "@/lib/portfolio-lock";
import { getOrCreatePortfolio } from "@/lib/user-portfolio";

export type ImportStamp = {
  /** The broker id, for example "ibkr_flex". */
  syncedFrom: string;
  /** The sync run that brought the rows in. */
  syncRunId: string;
};

export type CommitOutcome =
  | { ok: true; imported: number; alreadyImportedCount: number }
  | { ok: false; kind: "validation"; error: string }
  /** `row` is the 1-based position in the rows that were passed in. */
  | { ok: false; kind: "oversell"; error: string; row: number };

export async function loadKnownInstruments(): Promise<KnownInstrument[]> {
  return prisma.instrument.findMany({
    select: { id: true, ticker: true, market: true, currency: true },
  });
}

/**
 * Validate and write already-mapped rows into the user's portfolio, all or
 * nothing. Rows whose import reference is already stored (or repeated in the
 * batch) are left out and counted, not an error.
 */
export async function commitImportRows(
  userId: string,
  rows: MappedImportRow[],
  stamp?: ImportStamp,
): Promise<CommitOutcome> {
  const instruments = await loadKnownInstruments();
  const report = validateMappedRows(rows, instruments);

  const failed = report.results.filter((r) => !r.ok);
  if (failed.length > 0) {
    const first = failed[0];
    const firstIssue = first.ok ? "" : first.issues[0];
    return {
      ok: false,
      kind: "validation",
      error: `Nothing was imported: ${failed.length} of ${report.total} row${
        report.total === 1 ? "" : "s"
      } ${failed.length === 1 ? "has" : "have"} problems (first: row ${first.row} — ${firstIssue}). Fix them or leave them out, then try again.`,
    };
  }

  const portfolio = await getOrCreatePortfolio(userId);
  const okResults = report.results.flatMap((result) => (result.ok ? [result] : []));

  // One transaction that does BOTH the oversell check and the write while
  // holding a lock on this portfolio — so it's atomic:
  //   1. Lock the portfolio row (concurrent imports/sells wait their turn).
  //   2. Re-read the existing holdings INSIDE the lock (never a stale read).
  //   3. Walk the batch in order and reject any SELL that exceeds what's held
  //      at that point (a missed SELL would invent cash — golden rule).
  //   4. Only if every row is within its position, write them all.
  return prisma.$transaction(async (tx): Promise<CommitOutcome> => {
    await lockPortfolioForWrite(tx, portfolio.id);

    const existing = await tx.transaction.findMany({
      where: { portfolioId: portfolio.id },
    });
    const startingQuantities = new Map<string, number>();
    for (const holding of computeHoldings(existing.map(fromPrismaTransaction))) {
      startingQuantities.set(holding.instrumentId, holding.quantity);
    }

    // References already in THIS portfolio (read inside the lock).
    const knownReferences = new Set<string>();
    for (const row of existing) {
      if (row.importReference) knownReferences.add(row.importReference);
    }
    const keptResults: typeof okResults = [];
    let alreadyImportedCount = 0;
    for (const result of okResults) {
      const reference = result.reference;
      if (reference) {
        if (knownReferences.has(reference)) {
          alreadyImportedCount += 1;
          continue;
        }
        knownReferences.add(reference);
      }
      keptResults.push(result);
    }

    // The oversell walk sees only the rows that will really be written.
    const oversell = findImportOversell(keptResults, startingQuantities);
    if (oversell) {
      return {
        ok: false,
        kind: "oversell",
        error: `Nothing was imported: ${oversell.message}`,
        row: oversell.row,
      };
    }

    if (keptResults.length > 0) {
      await tx.transaction.createMany({
        data: keptResults.map((result) => ({
          ...toTransactionRecord(result.parsed),
          importReference: result.reference ?? null,
          portfolioId: portfolio.id,
          ...(stamp ? { syncedFrom: stamp.syncedFrom, syncRunId: stamp.syncRunId } : {}),
        })),
      });
    }
    return { ok: true, imported: keptResults.length, alreadyImportedCount };
  });
}

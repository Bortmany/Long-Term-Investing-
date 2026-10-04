"use server";

// CSV import, two steps:
//   1. validateImportRows — a DRY RUN: checks every mapped row and reports
//      plain-English issues per row. Writes nothing.
//   2. importTransactions — re-validates on the server (client results are
//      never trusted) and writes every row in ONE database transaction into
//      the signed-in user's portfolio: if anything fails, nothing imports.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import {
  MAX_IMPORT_REFERENCE_LENGTH,
  applyOversellProjection,
  findImportOversell,
  toTransactionRecord,
  validateMappedRows,
} from "@/lib/import-rows";
import { computeHoldings, fromPrismaTransaction } from "@/lib/portfolio";
import { lockPortfolioForWrite } from "@/lib/portfolio-lock";
// TYPE-ONLY import (import type), so these symbols are ERASED from the compiled
// server bundle. In a "use server" file a value-level import/re-export of a
// type is a runtime landmine: the server-action transform can emit a real
// `export { ImportValidationReport }`, and because the type doesn't exist at
// runtime that throws `ReferenceError: ... is not defined` the moment the
// action is called (it broke the whole CSV "Validate" step). Types therefore
// live only in @/lib/import-rows; UI code imports them straight from there.
import type {
  ImportValidationReport,
  KnownInstrument,
  MappedImportRow,
} from "@/lib/import-rows";
import { getOrCreatePortfolio, getSessionUserId } from "@/lib/user-portfolio";
import {
  IMPORT_RATE_LIMIT,
  rateLimit,
  rateLimitMessage,
  userKey,
} from "@/lib/rate-limit";

// Outer shape guard for the action's OWN arguments — the client sends an array
// of mapped rows and we never trust its structure. Deep per-row validation
// (numbers, dates, ticker resolution) still happens in src/lib/import-rows.ts;
// this only proves the top-level input is a bounded array of the right shape
// before any of it is read. The 2000-row cap keeps a single import bounded.
const importArgsSchema = z
  .array(
    z.object({
      ticker: z.string().optional(),
      market: z.string().optional(),
      type: z.string().optional(),
      quantity: z.string().optional(),
      pricePerUnit: z.string().optional(),
      amount: z.string().optional(),
      currency: z.string().optional(),
      fee: z.string().optional(),
      tradeDate: z.string().optional(),
      note: z.string().optional(),
      // Broker-preset / fingerprint reference, stored only to stop the same
      // line being imported twice. Length-capped; `line` is for messages and
      // is never stored.
      reference: z.string().max(MAX_IMPORT_REFERENCE_LENGTH).optional(),
      line: z.number().int().optional(),
    }),
  )
  .max(2000, "That's more rows than one import allows (max 2000). Split the file and try again.");

async function loadKnownInstruments(): Promise<KnownInstrument[]> {
  const rows = await prisma.instrument.findMany({
    select: { id: true, ticker: true, market: true, currency: true },
  });
  return rows;
}

/**
 * The signed-in user's current per-instrument share counts, keyed the same
 * way findImportOversell expects. Reads only — never creates a portfolio, so
 * a dry run on a brand-new account (no portfolio yet) just sees "nothing
 * held" rather than side-effecting one into existence.
 */
async function loadStartingQuantities(userId: string): Promise<Map<string, number>> {
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (!portfolio) return new Map();

  const existing = await prisma.transaction.findMany({
    where: { portfolioId: portfolio.id },
  });
  const startingQuantities = new Map<string, number>();
  for (const holding of computeHoldings(existing.map(fromPrismaTransaction))) {
    startingQuantities.set(holding.instrumentId, holding.quantity);
  }
  return startingQuantities;
}

/**
 * Dry-run validation of mapped CSV rows — NOTHING is written. Each row comes
 * back with ok/issues so the import screen can show exactly what to fix.
 * Tickers are resolved against the instruments already tracked in the app.
 */
export async function validateImportRows(
  mappedRows: MappedImportRow[],
): Promise<ActionResult<ImportValidationReport>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("tx-validate", userId), IMPORT_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  // Same top-level shape + row-count guard as importTransactions below, so a
  // stuck client (or a re-fired "Validate" click) can't force an unbounded
  // per-row validation loop or an unbounded instrument-table read.
  const parsedArgs = importArgsSchema.safeParse(mappedRows);
  if (!parsedArgs.success) {
    return actionError(
      parsedArgs.error.issues[0]?.message ??
        "Those import rows aren't in the expected format. Refresh the page and try again.",
    );
  }
  const rows = parsedArgs.data;
  if (rows.length === 0) {
    return actionError("There are no rows to check — upload or paste a CSV first.");
  }

  const instruments = await loadKnownInstruments();
  const report = validateMappedRows(rows, instruments);

  // Golden-rule honesty: the commit step's oversell guard is the real
  // enforcement, but the dry run must not tell someone "all rows look good"
  // when a SELL in the batch would actually be rejected at commit time.
  const startingQuantities = await loadStartingQuantities(userId);
  applyOversellProjection(report, startingQuantities);

  return actionOk(report);
}

/**
 * Import mapped CSV rows into the signed-in user's portfolio (created on
 * first use). All-or-nothing: every row is re-validated server-side and all
 * writes happen in one database transaction — one failure imports nothing.
 */
export async function importTransactions(
  mappedRows: MappedImportRow[],
): Promise<ActionResult<{ imported: number; alreadyImportedCount: number }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("tx-import", userId), IMPORT_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  // Top-level shape guard on this action's own arguments.
  const parsedArgs = importArgsSchema.safeParse(mappedRows);
  if (!parsedArgs.success) {
    return actionError(
      parsedArgs.error.issues[0]?.message ??
        "Those import rows aren't in the expected format. Refresh the page and try again.",
    );
  }
  const rows = parsedArgs.data;
  if (rows.length === 0) {
    return actionError("There are no rows to import.");
  }

  const instruments = await loadKnownInstruments();
  const report = validateMappedRows(rows, instruments);

  const failed = report.results.filter((r) => !r.ok);
  if (failed.length > 0) {
    const first = failed[0];
    const firstIssue = first.ok ? "" : first.issues[0];
    return actionError(
      `Nothing was imported: ${failed.length} of ${report.total} row${
        report.total === 1 ? "" : "s"
      } ${failed.length === 1 ? "has" : "have"} problems (first: row ${first.row} — ${firstIssue}). Fix them or leave them out, then try again.`,
    );
  }

  const portfolio = await getOrCreatePortfolio(userId);
  // Validated rows in order, each with its (optional) import reference.
  const okResults = report.results.flatMap((result) => (result.ok ? [result] : []));

  // One transaction that does BOTH the oversell check and the write while
  // holding a lock on this portfolio — so it's atomic:
  //   1. Lock the portfolio row (concurrent imports/sells wait their turn).
  //   2. Re-read the existing holdings INSIDE the lock (never a stale read).
  //   3. Walk the batch in order and reject any SELL that exceeds what's held
  //      at that point (existing shares + earlier BUYs in this same file) —
  //      the same guard the single-transaction path runs. A missed SELL here
  //      would invent cash the account never earned (golden rule).
  //   4. Only if every row is within its position, write them all — one
  //      failure imports nothing.
  const outcome = await prisma.$transaction(async (tx) => {
    await lockPortfolioForWrite(tx, portfolio.id);

    const existing = await tx.transaction.findMany({
      where: { portfolioId: portfolio.id },
    });
    const startingQuantities = new Map<string, number>();
    for (const holding of computeHoldings(existing.map(fromPrismaTransaction))) {
      startingQuantities.set(holding.instrumentId, holding.quantity);
    }

    // References already in THIS portfolio (read inside the lock, so a row
    // that appeared a moment ago is seen). Rows with a known reference — or a
    // repeat of one earlier in this same upload — are left out, not an error.
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
        ok: false as const,
        error: `Nothing was imported: ${oversell.message}`,
      };
    }

    if (keptResults.length > 0) {
      await tx.transaction.createMany({
        data: keptResults.map((result) => ({
          ...toTransactionRecord(result.parsed),
          importReference: result.reference ?? null,
          portfolioId: portfolio.id,
        })),
      });
    }
    return { ok: true as const, imported: keptResults.length, alreadyImportedCount };
  });

  if (!outcome.ok) return actionError(outcome.error);

  revalidatePath("/portfolio");
  revalidatePath("/dashboard");
  return actionOk({
    imported: outcome.imported,
    alreadyImportedCount: outcome.alreadyImportedCount,
  });
}

/**
 * The import references already stored in the signed-in user's portfolio, so
 * the import screen can show repeats as "Already imported" before anything is
 * sent. Scoped to the session user's own portfolio; reads only (never creates
 * a portfolio).
 */
export async function getKnownImportReferences(
  portfolioId: string,
): Promise<{ ok: true; references: string[] } | { ok: false; message: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, message: NOT_SIGNED_IN_ERROR };

  if (typeof portfolioId !== "string" || portfolioId.length === 0 || portfolioId.length > 100) {
    return { ok: false, message: "We could not find that portfolio." };
  }

  // Ownership check: the portfolio must belong to the signed-in user. Anyone
  // else's id gets the same answer as one that does not exist.
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId },
    select: { id: true },
  });
  if (!portfolio) return { ok: false, message: "We could not find that portfolio." };

  const rows = await prisma.transaction.findMany({
    where: { portfolioId: portfolio.id, importReference: { not: null } },
    select: { importReference: true },
  });
  const references = rows.flatMap((row) => (row.importReference ? [row.importReference] : []));
  return { ok: true, references };
}

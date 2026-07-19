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
  toTransactionRecord,
  validateMappedRows,
  type ImportRowResult,
  type ImportValidationReport,
  type KnownInstrument,
  type MappedImportRow,
} from "@/lib/import-rows";
import { getOrCreatePortfolio, getSessionUserId } from "@/lib/user-portfolio";
import {
  IMPORT_RATE_LIMIT,
  rateLimit,
  rateLimitMessage,
  userKey,
} from "@/lib/rate-limit";

export type { ImportRowResult, ImportValidationReport, MappedImportRow };

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
  return actionOk(validateMappedRows(rows, instruments));
}

/**
 * Import mapped CSV rows into the signed-in user's portfolio (created on
 * first use). All-or-nothing: every row is re-validated server-side and all
 * writes happen in one database transaction — one failure imports nothing.
 */
export async function importTransactions(
  mappedRows: MappedImportRow[],
): Promise<ActionResult<{ imported: number }>> {
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
  const records = report.results.flatMap((result) =>
    result.ok ? [toTransactionRecord(result.parsed)] : [],
  );

  // One transaction: either every row lands or none do.
  await prisma.$transaction(async (tx) => {
    await tx.transaction.createMany({
      data: records.map((record) => ({ ...record, portfolioId: portfolio.id })),
    });
  });

  revalidatePath("/portfolio");
  revalidatePath("/dashboard");
  return actionOk({ imported: records.length });
}

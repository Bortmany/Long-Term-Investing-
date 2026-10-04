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
  validateMappedRows,
} from "@/lib/import-rows";
import { computeHoldings, fromPrismaTransaction } from "@/lib/portfolio";
import { commitImportRows, loadKnownInstruments } from "@/lib/import-commit";
// TYPE-ONLY import (import type), so these symbols are ERASED from the compiled
// server bundle. In a "use server" file a value-level import/re-export of a
// type is a runtime landmine: the server-action transform can emit a real
// `export { ImportValidationReport }`, and because the type doesn't exist at
// runtime that throws `ReferenceError: ... is not defined` the moment the
// action is called (it broke the whole CSV "Validate" step). Types therefore
// live only in @/lib/import-rows; UI code imports them straight from there.
import type {
  ImportValidationReport,
  MappedImportRow,
} from "@/lib/import-rows";
import { getSessionUserId } from "@/lib/user-portfolio";
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
// The server (not only the browser's 5 MB file check) caps the size of every
// free-text field, so a hand-made request can't push a huge string through.
// Limits are generous for real data: tickers/ids are short, a note matches the
// 500-character limit of the Add Transaction form, numbers and dates are tiny.
const MAX_ROW_LINE = 1_000_000;
function capped(maxLength: number, label: string) {
  return z
    .string()
    .max(maxLength, `${label} is too long (the limit is ${maxLength} characters).`)
    .optional();
}

const importArgsSchema = z
  .array(
    z.object({
      ticker: capped(32, "A ticker"),
      market: capped(32, "A market"),
      type: capped(32, "A transaction type"),
      quantity: capped(64, "A quantity"),
      pricePerUnit: capped(64, "A price"),
      amount: capped(64, "An amount"),
      currency: capped(16, "A currency"),
      fee: capped(64, "A fee"),
      tradeDate: capped(64, "A trade date"),
      note: capped(500, "A note"),
      // Broker-preset / fingerprint reference, stored only to stop the same
      // line being imported twice. Length-capped; `line` is for messages and
      // is never stored.
      reference: z
        .string()
        .max(
          MAX_IMPORT_REFERENCE_LENGTH,
          `A row reference is too long (the limit is ${MAX_IMPORT_REFERENCE_LENGTH} characters).`,
        )
        .optional(),
      line: z.number().int().min(0).max(MAX_ROW_LINE).optional(),
    }),
  )
  .max(2000, "That's more rows than one import allows (max 2000). Split the file and try again.");

/** Plain-English refusal for a bad argument shape, naming the row when known. */
function argsErrorMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return "Those import rows aren't in the expected format. Refresh the page and try again.";
  }
  const rowIndex = issue.path[0];
  // The row-count cap has no row in its path: its own message says it all.
  if (typeof rowIndex !== "number") return issue.message;
  if (issue.code === "too_big" && issue.path.length > 1) {
    return `Row ${rowIndex + 1}: ${issue.message} Shorten it or leave that row out, then try again.`;
  }
  return `Row ${rowIndex + 1} isn't in the expected format. Refresh the page and try again.`;
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
    return actionError(argsErrorMessage(parsedArgs.error));
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
    return actionError(argsErrorMessage(parsedArgs.error));
  }
  const rows = parsedArgs.data;
  if (rows.length === 0) {
    return actionError("There are no rows to import.");
  }

  // Validation, the portfolio lock, the oversell guard and the write all live
  // in the shared commit path (also used by the broker sync).
  const outcome = await commitImportRows(userId, rows);

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
 * sent. The browser sends nothing: the portfolio is found from the SESSION
 * user (the same lookup the dry run uses). Reads only — never creates a
 * portfolio, so a brand-new account simply has nothing imported yet.
 */
export async function getKnownImportReferences(): Promise<
  ActionResult<{ references: string[] }>
> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("tx-known-refs", userId), IMPORT_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const portfolio = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!portfolio) return actionOk({ references: [] });

  const rows = await prisma.transaction.findMany({
    where: { portfolioId: portfolio.id, importReference: { not: null } },
    select: { importReference: true },
  });
  const references = rows.flatMap((row) => (row.importReference ? [row.importReference] : []));
  return actionOk({ references });
}

"use server";

// Create / update / delete one transaction, always scoped to the signed-in
// user's own portfolio. The portfolio is resolved from the session — a
// portfolioId from the client is never trusted. BUY/SELL amounts are always
// derived on the server from quantity × price (see transaction-schema.ts).

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import {
  toTransactionRecord,
  transactionInputSchema,
  type TransactionInput,
} from "@/lib/transaction-schema";
import { computeHoldings, fromPrismaTransaction } from "@/lib/portfolio";
import { lockPortfolioForWrite } from "@/lib/portfolio-lock";
import { getOrCreatePortfolio, getSessionUserId } from "@/lib/user-portfolio";
import {
  rateLimit,
  rateLimitMessage,
  userKey,
  WRITE_ACTION_RATE_LIMIT,
} from "@/lib/rate-limit";

function revalidatePortfolioPages() {
  revalidatePath("/portfolio");
  revalidatePath("/dashboard");
}

function firstIssueMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}

/**
 * Per-user write limit for the transaction actions. Returns an action error
 * when the user is over the limit, or null when the write may proceed.
 */
function writeRateLimitError(
  userId: string,
): { ok: false; error: string } | null {
  const result = rateLimit(userKey("tx-write", userId), WRITE_ACTION_RATE_LIMIT);
  return result.ok ? null : actionError(rateLimitMessage(result.retryAfterSeconds));
}

/** Instrument-carrying inputs must point at an instrument that exists. */
async function instrumentExists(input: TransactionInput): Promise<boolean> {
  if (!("instrumentId" in input) || !input.instrumentId) return true;
  const count = await prisma.instrument.count({
    where: { id: input.instrumentId },
  });
  return count > 0;
}

// A hair of tolerance so floating-point noise on a legitimate "sell
// everything" can't trip the guard.
const QUANTITY_EPSILON = 1e-6;

/**
 * Reject a SELL that would sell more shares than are actually held — otherwise
 * the sell would credit cash the account never earned (fabricated money).
 * `excludeTransactionId` leaves the row being edited out of the tally, so an
 * edit is checked against the OTHER transactions, not itself.
 *
 * Returns an action error, or null when the sell is within the position (or the
 * input isn't a sell).
 */
async function sellExceedsPositionError(
  db: Prisma.TransactionClient,
  portfolioId: string,
  input: TransactionInput,
  excludeTransactionId?: string,
): Promise<{ ok: false; error: string } | null> {
  if (input.type !== "SELL" || !input.instrumentId) return null;

  const rows = await db.transaction.findMany({
    where: {
      portfolioId,
      ...(excludeTransactionId ? { id: { not: excludeTransactionId } } : {}),
    },
  });
  const holding = computeHoldings(rows.map(fromPrismaTransaction)).find(
    (h) => h.instrumentId === input.instrumentId,
  );
  const held = holding?.quantity ?? 0;

  if (input.quantity > held + QUANTITY_EPSILON) {
    const heldLabel = held > 0 ? held : "no";
    return actionError(
      `You're trying to sell ${input.quantity} share${
        input.quantity === 1 ? "" : "s"
      }, but this account holds ${heldLabel} share${
        held === 1 ? "" : "s"
      } of it. Record the matching buys first, or sell fewer.`,
    );
  }
  return null;
}

/**
 * Add one transaction to the signed-in user's portfolio (the portfolio is
 * created on first use). Returns the new transaction's id.
 */
export async function createTransaction(
  input: TransactionInput,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = writeRateLimitError(userId);
  if (limited) return limited;

  const parsed = transactionInputSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueMessage(parsed.error));

  if (!(await instrumentExists(parsed.data))) {
    return actionError(
      "That instrument isn't tracked yet — track it first, then add the transaction.",
    );
  }

  const portfolio = await getOrCreatePortfolio(userId);
  const record = toTransactionRecord(parsed.data);

  // Atomic check-then-write: lock this portfolio's row, RE-CHECK the position
  // inside the same database transaction, then insert. Without the lock five
  // concurrent SELLs could all read the same stale holdings, all pass the
  // "can't sell more than you hold" check, and all write — minting cash the
  // account never earned. The lock makes them run one at a time.
  const outcome = await prisma.$transaction(async (tx) => {
    await lockPortfolioForWrite(tx, portfolio.id);
    const oversell = await sellExceedsPositionError(tx, portfolio.id, parsed.data);
    if (oversell) return oversell;
    const created = await tx.transaction.create({
      data: { ...record, portfolioId: portfolio.id },
    });
    return actionOk({ id: created.id });
  });

  if (outcome.ok) revalidatePortfolioPages();
  return outcome;
}

/**
 * Replace an existing transaction's values. The transaction must belong to
 * the signed-in user's portfolio — anything else is reported as not found.
 */
export async function updateTransaction(
  transactionId: string,
  input: TransactionInput,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = writeRateLimitError(userId);
  if (limited) return limited;

  if (!transactionId || typeof transactionId !== "string") {
    return actionError("That transaction could not be found.");
  }

  const parsed = transactionInputSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueMessage(parsed.error));

  // Ownership check: the row must live in one of THIS user's portfolios.
  const existing = await prisma.transaction.findFirst({
    where: { id: transactionId, portfolio: { userId } },
  });
  if (!existing) {
    return actionError("That transaction could not be found in your portfolio.");
  }

  if (!(await instrumentExists(parsed.data))) {
    return actionError(
      "That instrument isn't tracked yet — track it first, then update the transaction.",
    );
  }

  const record = toTransactionRecord(parsed.data);

  // Same atomic check-then-write as createTransaction: lock the portfolio,
  // re-check the edited values against the OTHER transactions (exclude this
  // row, which is being replaced), then write — so an edit can't win a stale
  // read and oversell either.
  const outcome = await prisma.$transaction(async (tx) => {
    await lockPortfolioForWrite(tx, existing.portfolioId);
    const oversell = await sellExceedsPositionError(
      tx,
      existing.portfolioId,
      parsed.data,
      existing.id,
    );
    if (oversell) return oversell;
    await tx.transaction.update({ where: { id: existing.id }, data: record });
    return actionOk({ id: existing.id });
  });

  if (outcome.ok) revalidatePortfolioPages();
  return outcome;
}

/**
 * Delete one transaction. The transaction must belong to the signed-in
 * user's portfolio.
 */
export async function deleteTransaction(
  transactionId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = writeRateLimitError(userId);
  if (limited) return limited;

  if (!transactionId || typeof transactionId !== "string") {
    return actionError("That transaction could not be found.");
  }

  const existing = await prisma.transaction.findFirst({
    where: { id: transactionId, portfolio: { userId } },
  });
  if (!existing) {
    return actionError("That transaction could not be found in your portfolio.");
  }

  try {
    await prisma.transaction.delete({ where: { id: existing.id } });
  } catch (error) {
    // P2025 = "record to delete does not exist". This happens when the SAME
    // transaction is deleted twice at once (two tabs, a double-click): the
    // first delete wins, the second finds nothing. That's not a server error —
    // the row is already gone, which is exactly what the caller wanted. Refresh
    // the pages and answer cleanly instead of throwing an unhandled 500.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      revalidatePortfolioPages();
      return actionError("That transaction was already removed.");
    }
    throw error;
  }

  revalidatePortfolioPages();
  return actionOk({ id: existing.id });
}

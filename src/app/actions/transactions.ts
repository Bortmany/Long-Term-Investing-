"use server";

// Create / update / delete one transaction, always scoped to the signed-in
// user's own portfolio. The portfolio is resolved from the session — a
// portfolioId from the client is never trusted. BUY/SELL amounts are always
// derived on the server from quantity × price (see transaction-schema.ts).

import { revalidatePath } from "next/cache";
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
import { getOrCreatePortfolio, getSessionUserId } from "@/lib/user-portfolio";

function revalidatePortfolioPages() {
  revalidatePath("/portfolio");
  revalidatePath("/dashboard");
}

function firstIssueMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}

/** Instrument-carrying inputs must point at an instrument that exists. */
async function instrumentExists(input: TransactionInput): Promise<boolean> {
  if (!("instrumentId" in input) || !input.instrumentId) return true;
  const count = await prisma.instrument.count({
    where: { id: input.instrumentId },
  });
  return count > 0;
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

  const parsed = transactionInputSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueMessage(parsed.error));

  if (!(await instrumentExists(parsed.data))) {
    return actionError(
      "That instrument isn't tracked yet — track it first, then add the transaction.",
    );
  }

  const portfolio = await getOrCreatePortfolio(userId);
  const record = toTransactionRecord(parsed.data);
  const created = await prisma.transaction.create({
    data: { ...record, portfolioId: portfolio.id },
  });

  revalidatePortfolioPages();
  return actionOk({ id: created.id });
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
  await prisma.transaction.update({
    where: { id: existing.id },
    data: record,
  });

  revalidatePortfolioPages();
  return actionOk({ id: existing.id });
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

  if (!transactionId || typeof transactionId !== "string") {
    return actionError("That transaction could not be found.");
  }

  const existing = await prisma.transaction.findFirst({
    where: { id: transactionId, portfolio: { userId } },
  });
  if (!existing) {
    return actionError("That transaction could not be found in your portfolio.");
  }

  await prisma.transaction.delete({ where: { id: existing.id } });

  revalidatePortfolioPages();
  return actionOk({ id: existing.id });
}

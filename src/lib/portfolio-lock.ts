// Per-portfolio write lock (closes the oversell race).
//
// The "can't sell more than you hold" guard reads the portfolio's transactions,
// decides the sell is allowed, then writes the new row — two separate steps.
// Run five SELLs at the same moment and all five can read the SAME stale
// holdings before any of them writes, so all five pass and the account mints
// cash it never earned (a fabricated number — the golden rule).
//
// The fix: before the read-check-write, take a row lock on the one portfolio
// being changed. `SELECT ... FOR UPDATE` makes the SECOND concurrent writer
// wait until the first commits, so it sees the first's write and the check is
// honest again. Locking the portfolio row (not the transaction rows) also
// covers a brand-new position that has no rows to lock yet.

import type { Prisma } from "@prisma/client";

/**
 * Hold a row lock on ONE portfolio for the rest of the current database
 * transaction. Must be called with a `prisma.$transaction` client (`tx`); the
 * lock is released automatically when that transaction commits or rolls back.
 */
export async function lockPortfolioForWrite(
  tx: Prisma.TransactionClient,
  portfolioId: string,
): Promise<void> {
  // Parameterised (never string-concatenated) so the id can't break out of
  // the query. The table name "Portfolio" is the Prisma model's default name.
  await tx.$queryRaw`SELECT id FROM "Portfolio" WHERE id = ${portfolioId} FOR UPDATE`;
}

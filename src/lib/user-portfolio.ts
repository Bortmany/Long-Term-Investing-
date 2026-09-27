// Server-side helpers shared by the Phase 2 server actions.
//
// SECURITY RULE (docs/CONVENTIONS.md): every user-owned query is scoped to
// the signed-in user's id taken from the server session — a portfolioId is
// NEVER accepted from the client.

import { headers } from "next/headers";
import { Prisma, type Portfolio } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** The signed-in user's id, or null when there is no valid session. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/**
 * The session user's portfolio. Created on first use (name "My Portfolio",
 * base currency OMR) so a brand-new account can add a transaction without a
 * setup step. The app is single-portfolio for now, and `Portfolio.userId` has
 * a DB-level unique constraint (prisma/schema.prisma), so there is never more
 * than one row to pick between.
 *
 * RACE-SAFE: two concurrent first-use calls (a double-submit, or two tabs
 * opened at once) can both pass the `findFirst` below finding nothing, and
 * both attempt `create`. The unique constraint lets only one of those creates
 * win; the loser gets Prisma's P2002 "unique constraint violated" error
 * instead of a silently-duplicated portfolio (which used to split the user's
 * transactions across two rows and understate their totals — exactly what
 * the "never show a made-up number" golden rule forbids). We catch that one
 * error and simply re-fetch the row the winner just created, the same
 * find-then-recover shape used for the P2025 delete-twice race in
 * src/app/actions/transactions.ts.
 */
export async function getOrCreatePortfolio(userId: string): Promise<Portfolio> {
  const existing = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  try {
    return await prisma.portfolio.create({
      data: { userId, name: "My Portfolio", baseCurrency: "OMR" },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Another concurrent call won the race and created it first — fetch
      // that row instead of failing the request.
      const winner = await prisma.portfolio.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
      if (winner) return winner;
    }
    throw error;
  }
}

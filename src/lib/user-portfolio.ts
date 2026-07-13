// Server-side helpers shared by the Phase 2 server actions.
//
// SECURITY RULE (docs/CONVENTIONS.md): every user-owned query is scoped to
// the signed-in user's id taken from the server session — a portfolioId is
// NEVER accepted from the client.

import { headers } from "next/headers";
import type { Portfolio } from "@prisma/client";
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
 * setup step. When more than one portfolio exists, the oldest one is "the"
 * portfolio — the app is single-portfolio for now.
 */
export async function getOrCreatePortfolio(userId: string): Promise<Portfolio> {
  const existing = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.portfolio.create({
    data: { userId, name: "My Portfolio", baseCurrency: "OMR" },
  });
}

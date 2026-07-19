// "Download my data" (engineering-standards.md §6). GET returns one
// complete JSON file of everything the signed-in user's account stores.
//
// The proxy already requires a session cookie to reach this path, but this
// route ALSO verifies the session itself (docs/CONVENTIONS.md: every query
// for user-owned data is scoped to the id from the server session) — the
// same belt-and-suspenders discipline the cron routes use for their own
// auth. Every Prisma read below uses `select`/`include` that matches
// src/lib/account-export.ts's row types field-for-field, so a credential
// column (account.password, session.token, …) never even leaves Postgres.

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { buildAccountExport } from "@/lib/account-export";
import { EXPORT_RATE_LIMIT, rateLimit, rateLimitMessage, userKey } from "@/lib/rate-limit";

export async function GET(request: NextRequest): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { message: "You need to be signed in to do that. Please sign in and try again." },
      { status: 401 },
    );
  }
  const userId = session.user.id;

  const limited = rateLimit(userKey("account-export", userId), EXPORT_RATE_LIMIT);
  if (!limited.ok) {
    return NextResponse.json(
      { message: rateLimitMessage(limited.retryAfterSeconds) },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, createdAt: true },
  });
  if (!user) {
    // The session cookie outlived the user row (shouldn't happen — kept
    // honest rather than a 500 if it ever does).
    return NextResponse.json({ message: "Account not found." }, { status: 404 });
  }

  const [accounts, sessions, portfolios, watchlist, theses, aiAnalyses, weeklyReviews, alerts, notifications] =
    await Promise.all([
      prisma.account.findMany({
        where: { userId },
        select: { providerId: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.session.findMany({
        where: { userId },
        select: { createdAt: true, ipAddress: true, userAgent: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.portfolio.findMany({
        where: { userId },
        include: {
          transactions: {
            include: { instrument: { select: { ticker: true } } },
            orderBy: { tradeDate: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.watchlistItem.findMany({
        where: { userId },
        include: { instrument: { select: { ticker: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.thesis.findMany({
        where: { userId },
        include: {
          instrument: { select: { ticker: true } },
          checks: { orderBy: { createdAt: "desc" } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.aiAnalysis.findMany({
        where: { userId },
        select: { type: true, model: true, createdAt: true, dataAsOf: true, output: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.weeklyReview.findMany({
        where: { userId },
        select: { period: true, output: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.alert.findMany({
        where: { userId },
        include: {
          instrument: { select: { ticker: true } },
          thesis: { select: { statement: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.notification.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          body: true,
          priceAtTrigger: true,
          priceCurrency: true,
          priceSource: true,
          priceAsOf: true,
          readAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const exportData = buildAccountExport({
    user,
    accounts,
    sessions,
    portfolios,
    watchlist,
    theses,
    aiAnalyses,
    weeklyReviews,
    alerts,
    notifications,
  });

  logger.info("Account data export downloaded", { userId });

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="investiq-data-${today}.json"`,
    },
  });
}

// The actual Weekly Review generation logic (Phase 6), factored OUT of
// src/app/actions/reviews.ts on purpose: that file has `"use server"` at the
// top, which turns EVERY exported function into a callable Server Action
// endpoint — including ones that don't check the caller's identity. This
// function takes a raw `userId` with no session check of its own (that is
// the whole point: it also serves the cron route, which authenticates via a
// bearer token + a trusted env var, never a browser session), so it must
// live in a plain module that is never treated as an action surface.
//
// Callers:
//   - src/app/actions/reviews.ts's `runWeeklyReview()` — the session-guarded
//     wrapper every UI button calls, after resolving `userId` from the
//     signed-in session.
//   - src/app/api/cron/weekly-review/route.ts — the token-protected,
//     disabled-by-default scheduled job, which only ever passes
//     `process.env.CRON_USER_ID` (never a userId from the request itself).
//
// SECURITY RULE (Phase-5-class bug, do not repeat): every query here is
// scoped to the `userId` passed in — never subjectId/period alone.

import { prisma } from "@/lib/prisma";
import { ANALYSIS_MODEL } from "@/lib/ai/client";
import { runAnalysis } from "@/lib/ai/analysis";
import { weeklyReviewSchema, type WeeklyReviewOutput } from "@/lib/ai/schemas";
import {
  actionError,
  actionOk,
  type ActionResult,
} from "@/lib/action-result";
import {
  computeAllocation,
  computePortfolioValue,
  fromPrismaFxRate,
  fromPrismaPriceCache,
  fromPrismaTransaction,
  type AllocatableHolding,
} from "@/lib/portfolio";
import { getOrCreatePortfolio } from "@/lib/user-portfolio";
import { computeReviewDeltas, type ReviewSnapshot } from "./deltas";
import { isoWeekPeriod } from "./period";

/** Maps a runAnalysis failure to a plain-English sentence — same mapping every action file uses. */
function mapUnavailableToMessage(reason: string): string {
  return reason === "no_api_key"
    ? "AI features are turned off."
    : "Something went wrong generating this analysis.";
}

/**
 * Generate (or reuse) the weekly review for exactly one user, identified by
 * `userId`. Has no session/auth logic of its own — every caller is
 * responsible for having already established that `userId` is the right
 * one to act on (see the file header).
 */
export async function runWeeklyReviewForUser(
  userId: string,
): Promise<ActionResult<{ id: string; reused: boolean }>> {
  const portfolio = await getOrCreatePortfolio(userId);
  const period = isoWeekPeriod(new Date());

  // The previous review for this user, deliberately excluding the CURRENT
  // period — re-running the review mid-week (e.g. after a new transaction)
  // must compare against last week's review, not an earlier same-week run.
  const previousReview = await prisma.weeklyReview.findFirst({
    where: { userId, period: { not: period } },
    orderBy: { createdAt: "desc" },
  });

  const [
    transactionRows,
    instrumentRows,
    priceRows,
    fxRows,
    latestHealthScore,
    thesesWithLatestCheck,
    committeeRows,
  ] = await Promise.all([
    prisma.transaction.findMany({ where: { portfolioId: portfolio.id } }),
    prisma.instrument.findMany(),
    prisma.priceCache.findMany(),
    prisma.fxRate.findMany(),
    prisma.aiAnalysis.findFirst({
      where: {
        userId,
        type: "HEALTH_SCORE",
        subjectType: "portfolio",
        subjectId: portfolio.id,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.thesis.findMany({
      where: { userId },
      include: {
        instrument: true,
        checks: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.aiAnalysis.findMany({
      where: { userId, type: "COMMITTEE" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const instrumentById = new Map(instrumentRows.map((i) => [i.id, i]));
  const transactions = transactionRows.map(fromPrismaTransaction);
  const prices = priceRows.map(fromPrismaPriceCache);
  const fxRates = fxRows.map(fromPrismaFxRate);

  const portfolioValue = computePortfolioValue({
    transactions,
    prices,
    fxRates,
    baseCurrency: portfolio.baseCurrency,
  });

  // Only holdings that could actually be valued feed the allocation slices —
  // same idiom as buildHealthScoreInput.
  const allocatable: AllocatableHolding[] = portfolioValue.holdings.flatMap((holding) => {
    if (!holding.valuation.ok) return [];
    const instrument = instrumentById.get(holding.instrumentId);
    if (!instrument) return [];
    return [
      {
        instrumentId: holding.instrumentId,
        marketValue: holding.valuation.marketValue,
        sector: instrument.sector,
        country: instrument.country,
        market: instrument.market,
      },
    ];
  });
  const sectorAllocation = computeAllocation(allocatable, "sector");

  const currentSnapshot: ReviewSnapshot = {
    totalValue: portfolioValue.totalValue,
    allocation: sectorAllocation.slices.map((slice) => ({
      category: slice.label,
      percent: Math.round(slice.sharePercent * 100) / 100,
    })),
  };

  // The previous review's own reported allocation drift IS a real allocation
  // snapshot for last week (see deltas.ts's design note on why total value
  // isn't available). Defensively re-validate the stored JSON before reading
  // it — it's read back as `unknown`, and WeeklyReview.output isn't
  // re-validated on every read the way AiAnalysis.output is inside runAnalysis.
  let previousSnapshot: ReviewSnapshot | null = null;
  if (previousReview) {
    const parsedPrevious = weeklyReviewSchema.safeParse(previousReview.output);
    previousSnapshot = {
      // Never persisted — honestly unknown, not guessed (see deltas.ts).
      totalValue: null,
      allocation: parsedPrevious.success
        ? parsedPrevious.data.allocationDrift.map((drift) => ({
            category: drift.category,
            percent: drift.actualPercent,
          }))
        : [],
    };
  }
  const deltas = computeReviewDeltas(currentSnapshot, previousSnapshot);

  // Dividend transactions since the previous review (or the last 7 days when
  // this is the user's first-ever review).
  const dividendSince = previousReview
    ? previousReview.createdAt
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dividendEvents = transactionRows
    .filter((t) => t.type === "DIVIDEND" && t.tradeDate >= dividendSince)
    .map((t) => ({
      ticker: t.instrumentId ? (instrumentById.get(t.instrumentId)?.ticker ?? "unknown") : null,
      amount: t.amount.toNumber(),
      currency: t.currency,
      tradeDate: t.tradeDate.toISOString(),
    }));

  const dataGaps: string[] = [];
  if (!portfolioValue.complete) {
    dataGaps.push(
      "Some holdings or cash balances could not be valued this week (missing price or FX rate).",
    );
  }

  // dataAsOf: the newest real "as of" among ALL the sources that actually fed
  // this computation — prices and FX rates, plus the prior AI artifacts folded
  // into the review (health score, each thesis's latest check, committee runs).
  // Honest, never invented; same idiom as every other action file.
  const candidateDates: Date[] = [
    ...prices.map((p) => p.asOf),
    ...fxRows.map((r) => r.asOf),
    ...(latestHealthScore ? [latestHealthScore.dataAsOf] : []),
    ...committeeRows.map((r) => r.dataAsOf),
    ...thesesWithLatestCheck.flatMap((t) =>
      t.checks[0] ? [t.checks[0].dataAsOf] : [],
    ),
  ];
  const dataAsOf =
    candidateDates.length > 0
      ? candidateDates.reduce((a, b) => (b > a ? b : a))
      : new Date();

  const buildInput = async () => ({
    input: {
      period,
      baseCurrency: portfolio.baseCurrency,
      valuation: {
        totalValue: portfolioValue.totalValue,
        holdingsValue: portfolioValue.holdingsValue,
        cashValue: portfolioValue.cashValue,
        complete: portfolioValue.complete,
      },
      allocationBySector: currentSnapshot.allocation,
      deltas,
      dividendEvents,
      previousReview: previousReview
        ? { period: previousReview.period, generatedAt: previousReview.createdAt.toISOString() }
        : null,
      latestHealthScore: latestHealthScore
        ? { output: latestHealthScore.output, generatedAt: latestHealthScore.createdAt.toISOString() }
        : null,
      theses: thesesWithLatestCheck.map((thesis) => ({
        ticker: thesis.instrument.ticker,
        statement: thesis.statement,
        status: thesis.status,
        latestCheck: thesis.checks[0]
          ? {
              integrityScore: thesis.checks[0].integrityScore,
              recommendation: thesis.checks[0].recommendation,
              dataAsOf: thesis.checks[0].dataAsOf.toISOString(),
            }
          : null,
      })),
      latestCommitteeRuns: (() => {
        // Keep only the most recent COMMITTEE row per instrument (subjectId).
        const latestBySubject = new Map<string, (typeof committeeRows)[number]>();
        for (const row of committeeRows) {
          if (!latestBySubject.has(row.subjectId)) latestBySubject.set(row.subjectId, row);
        }
        return [...latestBySubject.values()].map((row) => ({
          ticker: instrumentById.get(row.subjectId)?.ticker ?? "unknown",
          output: row.output,
          generatedAt: row.createdAt.toISOString(),
        }));
      })(),
      dataGaps,
    },
    dataAsOf,
  });

  const result = await runAnalysis({
    userId,
    type: "WEEKLY_REVIEW",
    subjectType: "portfolio",
    subjectId: portfolio.id,
    model: ANALYSIS_MODEL,
    schema: weeklyReviewSchema,
    buildInput,
  });

  if (!result.ok) {
    return actionError(mapUnavailableToMessage(result.unavailable));
  }

  // Upsert (never plain create): this is the Phase-6 equivalent of
  // checkThesis's self-healing dedupe (see theses.ts's comment). It ensures a
  // WeeklyReview row always exists for whatever AiAnalysis row runAnalysis
  // just persisted/reused, keyed on the new (userId, period) unique — and
  // correctly overwrites a same-week row when the user re-runs the review
  // after their portfolio changed (a fresh AiAnalysis row, new hash) rather
  // than crashing on the unique constraint.
  const output: WeeklyReviewOutput = result.data.output;
  const row = await prisma.weeklyReview.upsert({
    where: { userId_period: { userId, period } },
    create: {
      userId,
      period,
      model: result.data.model,
      dataAsOf: result.data.dataAsOf,
      output,
      createdAt: result.data.createdAt,
    },
    update: {
      model: result.data.model,
      dataAsOf: result.data.dataAsOf,
      output,
      createdAt: result.data.createdAt,
    },
  });

  return actionOk({ id: row.id, reused: result.data.reused });
}

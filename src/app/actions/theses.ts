"use server";

// Thesis Tracker server actions, always scoped to the signed-in user
// (BUILD-PLAN.md Phase 4). Follows the same skeleton as
// src/app/actions/stocks.ts / transactions.ts: session → rate limit → zod
// parse → ownership check → mutate → revalidate.

import { revalidatePath } from "next/cache";
import type { Instrument, Prisma, Thesis } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getSessionUserId } from "@/lib/user-portfolio";
import {
  AI_GENERATION_RATE_LIMIT,
  rateLimit,
  rateLimitMessage,
  userKey,
  WRITE_ACTION_RATE_LIMIT,
} from "@/lib/rate-limit";
import {
  getDividendHistory,
  getFinancialStatements,
  getProfile,
  getQuote,
} from "@/lib/data";
import { ANALYSIS_MODEL } from "@/lib/ai/client";
import { runAnalysis } from "@/lib/ai/analysis";
import { thesisCheckSchema } from "@/lib/ai/schemas";
import { mapRecommendationToPrisma } from "@/lib/theses/checks";
import {
  computeCurrentRatio,
  computeDebtToEquity,
  computeDividendYield,
  computePriceToBook,
  computePriceToEarnings,
  computeReturnOnEquity,
  latestStatementRow,
  sumTrailingDividendsPerShare,
} from "@/lib/stocks/ratios";

function revalidateThesisPages(thesisId?: string) {
  revalidatePath("/theses");
  if (thesisId) revalidatePath(`/theses/${thesisId}`);
}

// ---------------------------------------------------------------------------
// Create / close / reopen
// ---------------------------------------------------------------------------

const createThesisSchema = z.object({
  instrumentId: z
    .string({ error: "Pick a stock first." })
    .min(1, "Pick a stock first."),
  statement: z
    .string({ error: "Write your thesis statement." })
    .trim()
    .min(10, "Write a bit more about why you hold this position.")
    .max(4000, "Keep the statement under 4,000 characters."),
});

const thesisIdSchema = z
  .string({ error: "That thesis could not be found." })
  .min(1, "That thesis could not be found.");

/**
 * Create a new thesis for the signed-in user. Any existing instrument is
 * accepted (not restricted to held/watched) — the New Thesis dialog only
 * OFFERS held/watched instruments as a UI convenience, matching how
 * addToWatchlist doesn't restrict itself to held instruments either.
 */
export async function createThesis(input: {
  instrumentId: string;
  statement: string;
}): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(
    userKey("thesis-write", userId),
    WRITE_ACTION_RATE_LIMIT,
  );
  if (!limited.ok)
    return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsed = createThesisSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Please check the form and try again.",
    );
  }

  const instrument = await prisma.instrument.findUnique({
    where: { id: parsed.data.instrumentId },
  });
  if (!instrument) return actionError("That stock could not be found.");

  const created = await prisma.thesis.create({
    data: {
      userId,
      instrumentId: instrument.id,
      statement: parsed.data.statement,
    },
  });

  revalidateThesisPages(created.id);
  return actionOk({ id: created.id });
}

/** Shared by closeThesis/reopenThesis — both are a status flip, ownership-checked. */
async function setThesisStatus(
  thesisId: string,
  status: "ACTIVE" | "CLOSED",
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(
    userKey("thesis-write", userId),
    WRITE_ACTION_RATE_LIMIT,
  );
  if (!limited.ok)
    return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsedId = thesisIdSchema.safeParse(thesisId);
  if (!parsedId.success) {
    return actionError(parsedId.error.issues[0]?.message ?? "That thesis could not be found.");
  }

  // Ownership check: the row must belong to THIS signed-in user.
  const existing = await prisma.thesis.findFirst({
    where: { id: parsedId.data, userId },
  });
  if (!existing) return actionError("That thesis could not be found.");

  await prisma.thesis.update({ where: { id: existing.id }, data: { status } });

  revalidateThesisPages(existing.id);
  return actionOk({ id: existing.id });
}

export async function closeThesis(
  thesisId: string,
): Promise<ActionResult<{ id: string }>> {
  return setThesisStatus(thesisId, "CLOSED");
}

export async function reopenThesis(
  thesisId: string,
): Promise<ActionResult<{ id: string }>> {
  return setThesisStatus(thesisId, "ACTIVE");
}

// ---------------------------------------------------------------------------
// THESIS_CHECK generation
// ---------------------------------------------------------------------------

/**
 * What the AI sees for a THESIS_CHECK run. Built from the SAME src/lib/data
 * barrel calls and the SAME pure ratio functions the stock page's ratio
 * strip uses, so the figures the model reasons about match what the owner
 * can see elsewhere. Any block that couldn't be fetched is listed in
 * `dataGaps` in plain English — never guessed (golden rule).
 */
type ThesisCheckAiInput = {
  instructions: string;
  thesis: {
    statement: string;
    createdAt: string;
    status: string;
  };
  instrument: {
    ticker: string;
    name: string;
    market: string;
    sector: string | null;
    country: string | null;
  };
  quote:
    | { ok: true; price: number; currency: string; asOf: string }
    | { ok: false; reason: string };
  profile:
    | {
        ok: true;
        industry: string | null;
        description: string | null;
        marketCap: number | null;
      }
    | { ok: false; reason: string };
  ratios: {
    priceToEarnings: number | null;
    priceToBook: number | null;
    dividendYieldPct: number | null;
    debtToEquity: number | null;
    returnOnEquityPct: number | null;
    currentRatio: number | null;
  };
  dividends: {
    trailingTwelveMonthPerShare: number | null;
    paymentCount: number;
  };
  dataGaps: string[];
};

const THESIS_CHECK_INSTRUCTIONS =
  "Produce a THESIS_CHECK analysis: re-examine the investor's ORIGINAL thesis " +
  "statement (given below) against the CURRENT data for this instrument, and " +
  "judge whether the thesis still holds. Give an integrityScore (0-100 — how " +
  "intact the original case still is) and a recommendation: INTACT (the case " +
  "still holds), WEAKENING (real cracks have appeared but it isn't broken), " +
  "or BROKEN (a core assumption of the thesis has failed). List concrete " +
  "evidence in three buckets: supporting (still backs the original thesis), " +
  "weakening (undermines it), and improving (new positive evidence NOT " +
  "mentioned in the original statement). List watchItems: specific things " +
  "the investor should monitor going forward. Write a short, plain-English " +
  "summary of your overall judgment.";

async function buildThesisCheckInput(
  thesis: Thesis,
  instrument: Instrument,
): Promise<{ input: ThesisCheckAiInput; dataAsOf: Date }> {
  const ref = {
    id: instrument.id,
    ticker: instrument.ticker,
    market: instrument.market,
    currency: instrument.currency,
  };
  const now = new Date();

  const [quoteResult, profileResult, incomeResult, balanceResult, dividendResult] =
    await Promise.all([
      getQuote(ref),
      getProfile(ref),
      getFinancialStatements(ref, "income", "annual"),
      getFinancialStatements(ref, "balance", "annual"),
      getDividendHistory(ref),
    ]);

  const dataGaps: string[] = [];
  const price = quoteResult.ok ? quoteResult.data.price : null;
  if (!quoteResult.ok)
    dataGaps.push(`Current price: ${quoteResult.message ?? quoteResult.unavailable}`);
  if (!profileResult.ok)
    dataGaps.push(`Company profile: ${profileResult.message ?? profileResult.unavailable}`);

  const income = incomeResult.ok
    ? latestStatementRow(incomeResult.data.rows)
    : undefined;
  const balance = balanceResult.ok
    ? latestStatementRow(balanceResult.data.rows)
    : undefined;
  if (!incomeResult.ok)
    dataGaps.push(`Income statement: ${incomeResult.message ?? incomeResult.unavailable}`);
  if (!balanceResult.ok)
    dataGaps.push(`Balance sheet: ${balanceResult.message ?? balanceResult.unavailable}`);

  const trailingDividendPerShare = dividendResult.ok
    ? sumTrailingDividendsPerShare(dividendResult.data, now)
    : null;
  if (!dividendResult.ok)
    dataGaps.push(`Dividend history: ${dividendResult.message ?? dividendResult.unavailable}`);

  const peRatio = computePriceToEarnings(price, income);
  const pbRatio = computePriceToBook(price, income, balance);
  const dividendYield = computeDividendYield(price, trailingDividendPerShare);
  const debtToEquity = computeDebtToEquity(balance);
  const roe = computeReturnOnEquity(income, balance);
  const currentRatio = computeCurrentRatio(balance);

  const dataAsOf = quoteResult.ok ? quoteResult.data.asOf : now;

  return {
    input: {
      instructions: THESIS_CHECK_INSTRUCTIONS,
      thesis: {
        statement: thesis.statement,
        createdAt: thesis.createdAt.toISOString(),
        status: thesis.status,
      },
      instrument: {
        ticker: instrument.ticker,
        name: instrument.name,
        market: instrument.market,
        sector: instrument.sector,
        country: instrument.country,
      },
      quote: quoteResult.ok
        ? {
            ok: true,
            price: quoteResult.data.price,
            currency: quoteResult.data.currency,
            asOf: quoteResult.data.asOf.toISOString(),
          }
        : { ok: false, reason: quoteResult.message ?? quoteResult.unavailable },
      profile: profileResult.ok
        ? {
            ok: true,
            industry: profileResult.data.industry,
            description: profileResult.data.description,
            marketCap: profileResult.data.marketCap,
          }
        : { ok: false, reason: profileResult.message ?? profileResult.unavailable },
      ratios: {
        priceToEarnings: peRatio.ok ? peRatio.value : null,
        priceToBook: pbRatio.ok ? pbRatio.value : null,
        dividendYieldPct: dividendYield.ok ? dividendYield.value : null,
        debtToEquity: debtToEquity.ok ? debtToEquity.value : null,
        returnOnEquityPct: roe.ok ? roe.value : null,
        currentRatio: currentRatio.ok ? currentRatio.value : null,
      },
      dividends: {
        trailingTwelveMonthPerShare: trailingDividendPerShare,
        paymentCount: dividendResult.ok ? dividendResult.data.length : 0,
      },
      dataGaps,
    },
    dataAsOf,
  };
}

/**
 * Generate (or, if nothing about this thesis's inputs has changed since the
 * last run, silently reuse) a THESIS_CHECK analysis, then persist a
 * ThesisCheck row for the check-history timeline and integrity sparkline.
 * THE AI RULE: this only ever runs from an explicit "Check thesis now" click
 * — never on page render. A ThesisCheck row is recorded on every successful
 * call (fresh generation or reuse) — the owner explicitly asked to be
 * checked again, so each click is its own checkpoint in the history, even
 * when the underlying data (and therefore the result) hasn't moved.
 */
export async function checkThesis(
  thesisId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(
    userKey("ai-thesis-check", userId),
    AI_GENERATION_RATE_LIMIT,
  );
  if (!limited.ok)
    return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsedId = thesisIdSchema.safeParse(thesisId);
  if (!parsedId.success) {
    return actionError(parsedId.error.issues[0]?.message ?? "That thesis could not be found.");
  }

  const thesis = await prisma.thesis.findFirst({
    where: { id: parsedId.data, userId },
    include: { instrument: true },
  });
  if (!thesis) return actionError("That thesis could not be found.");

  const result = await runAnalysis({
    userId,
    type: "THESIS_CHECK",
    subjectType: "thesis",
    subjectId: thesis.id,
    model: ANALYSIS_MODEL,
    buildInput: () => buildThesisCheckInput(thesis, thesis.instrument),
    schema: thesisCheckSchema,
  });

  if (!result.ok) return actionError(result.message);

  await prisma.thesisCheck.create({
    data: {
      thesisId: thesis.id,
      integrityScore: result.data.integrityScore,
      recommendation: mapRecommendationToPrisma(result.data.recommendation),
      evidence: result.data.evidence as Prisma.InputJsonValue,
      model: result.analysis.model,
    },
  });

  revalidateThesisPages(thesis.id);
  return actionOk({ id: result.analysis.id });
}

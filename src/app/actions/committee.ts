"use server";

// Committee, Buy Analysis and Sell Analysis server actions (BUILD-PLAN.md
// Phase 5), always scoped to the signed-in user. Same skeleton as
// src/app/actions/theses.ts / stocks.ts: session → rate limit → zod parse →
// existence check → build input from the SAME src/lib/data barrel calls +
// pure ratio functions the stock/thesis pages use → generate (or reuse) →
// revalidate.

import { revalidatePath } from "next/cache";
import type { Instrument, Thesis } from "@prisma/client";
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
} from "@/lib/rate-limit";
import {
  getDividendHistory,
  getFinancialStatements,
  getProfile,
  getQuote,
} from "@/lib/data";
import { computeHoldings, fromPrismaTransaction } from "@/lib/portfolio";
import { ANALYSIS_MODEL } from "@/lib/ai/client";
import { runAnalysis } from "@/lib/ai/analysis";
import { runCommittee } from "@/lib/ai/committee";
import { buyAnalysisSchema, sellAnalysisSchema } from "@/lib/ai/schemas";
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

const instrumentIdSchema = z
  .string({ error: "Pick a stock first." })
  .min(1, "Pick a stock first.");

// ---------------------------------------------------------------------------
// Shared fundamentals block every one of the three analyses starts from —
// the SAME barrel calls + pure ratio math the /stocks/[id] ratio strip and
// buildStockScoreInput/buildThesisCheckInput use, so the numbers the AI
// reasons about always match what the owner can see elsewhere. Any block
// that couldn't be fetched is listed in `dataGaps` in plain English, never
// guessed (golden rule).
// ---------------------------------------------------------------------------

type FundamentalsBlock = {
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
  dataAsOf: Date;
};

async function buildFundamentalsBlock(instrument: Instrument): Promise<FundamentalsBlock> {
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

  const income = incomeResult.ok ? latestStatementRow(incomeResult.data.rows) : undefined;
  const balance = balanceResult.ok ? latestStatementRow(balanceResult.data.rows) : undefined;
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

  return {
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
    dataAsOf: quoteResult.ok ? quoteResult.data.asOf : now,
  };
}

function instrumentSummary(instrument: Instrument) {
  return {
    ticker: instrument.ticker,
    name: instrument.name,
    market: instrument.market,
    sector: instrument.sector,
    country: instrument.country,
  };
}

// ---------------------------------------------------------------------------
// COMMITTEE — conveneCommittee
// ---------------------------------------------------------------------------

async function buildCommitteeInput(
  instrument: Instrument,
  thesis: Thesis | null,
): Promise<{ input: unknown; dataAsOf: Date }> {
  const fundamentals = await buildFundamentalsBlock(instrument);
  return {
    input: {
      instrument: instrumentSummary(instrument),
      quote: fundamentals.quote,
      profile: fundamentals.profile,
      ratios: fundamentals.ratios,
      dividends: fundamentals.dividends,
      thesis: thesis
        ? { statement: thesis.statement, createdAt: thesis.createdAt.toISOString() }
        : null,
      dataGaps: fundamentals.dataGaps,
    },
    dataAsOf: fundamentals.dataAsOf,
  };
}

/**
 * Convene the six-persona committee on one instrument, auto-attaching the
 * signed-in user's ACTIVE thesis for it when one exists (ui-spec §6.1).
 * THE AI RULE: only ever runs from an explicit "Convene Committee" click.
 */
export async function conveneCommittee(
  instrumentId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("ai-committee", userId), AI_GENERATION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsed = instrumentIdSchema.safeParse(instrumentId);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Pick a stock first.");
  }

  const instrument = await prisma.instrument.findUnique({ where: { id: parsed.data } });
  if (!instrument) return actionError("That stock could not be found.");

  const thesis = await prisma.thesis.findFirst({
    where: { userId, instrumentId: instrument.id, status: "ACTIVE" },
  });

  const result = await runCommittee({
    userId,
    instrumentId: instrument.id,
    model: ANALYSIS_MODEL,
    buildInput: () => buildCommitteeInput(instrument, thesis),
  });

  if (!result.ok) return actionError(result.message);

  revalidatePath("/committee");
  return actionOk({ id: result.analysis.id });
}

// ---------------------------------------------------------------------------
// BUY_ANALYSIS — runBuyAnalysis
// ---------------------------------------------------------------------------

const BUY_ANALYSIS_INSTRUCTIONS =
  "Produce a BUY_ANALYSIS for an investor considering a NEW purchase of this " +
  "instrument. Give: a buy score (0-100), a fair value estimate with its " +
  "plain-English assumptions stated explicitly (e.g. \"DCF with 8% discount " +
  "rate, 3% terminal growth\"), the margin of safety as a signed percent " +
  "(fair value vs current price), an upside case and a downside case (each a " +
  "signed percent), a suggested position size as a percent of the whole " +
  "portfolio, your confidence, and 2-3 alternative tickers worth considering " +
  "instead with a one-line reason each.";

async function buildBuyAnalysisInput(
  instrument: Instrument,
): Promise<{ input: unknown; dataAsOf: Date }> {
  const fundamentals = await buildFundamentalsBlock(instrument);
  return {
    input: {
      instructions: BUY_ANALYSIS_INSTRUCTIONS,
      instrument: instrumentSummary(instrument),
      quote: fundamentals.quote,
      profile: fundamentals.profile,
      ratios: fundamentals.ratios,
      dividends: fundamentals.dividends,
      dataGaps: fundamentals.dataGaps,
    },
    dataAsOf: fundamentals.dataAsOf,
  };
}

/**
 * Generate (or reuse, by input hash) a BUY_ANALYSIS for one instrument.
 * Button-only per ui-spec §6.1 (no separate ticker/price/horizon/risk-
 * tolerance form) — see this session's report for the note on BUILD-PLAN's
 * older, more elaborate phrasing.
 */
export async function runBuyAnalysis(
  instrumentId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("ai-buy-analysis", userId), AI_GENERATION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsed = instrumentIdSchema.safeParse(instrumentId);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Pick a stock first.");
  }

  const instrument = await prisma.instrument.findUnique({ where: { id: parsed.data } });
  if (!instrument) return actionError("That stock could not be found.");

  const result = await runAnalysis({
    userId,
    type: "BUY_ANALYSIS",
    subjectType: "instrument",
    subjectId: instrument.id,
    model: ANALYSIS_MODEL,
    buildInput: () => buildBuyAnalysisInput(instrument),
    schema: buyAnalysisSchema,
  });

  if (!result.ok) return actionError(result.message);

  revalidatePath("/committee");
  return actionOk({ id: result.analysis.id });
}

// ---------------------------------------------------------------------------
// SELL_ANALYSIS — runSellAnalysis
// ---------------------------------------------------------------------------

const SELL_ANALYSIS_INSTRUCTIONS =
  "Produce a SELL_ANALYSIS for an investor deciding whether to sell an " +
  "existing position in this instrument. Weigh: valuation excess (is the " +
  "price now stretched versus fundamentals), whether any recorded thesis for " +
  "this stock (thesisChecks below, if any — most recent first) has weakened " +
  "or broken, deterioration in management execution, debt or profitability, " +
  "whether a clearly better alternative exists, and concentration risk (this " +
  "position's size within the portfolio, if known). Give a sellScore (0-100, " +
  "higher means a stronger case to sell), your reasons to sell (each with " +
  "its own supporting evidence), the strongest counterarguments to selling " +
  "(each with its own evidence), and your confidence.";

async function buildSellAnalysisInput(
  userId: string,
  instrument: Instrument,
): Promise<{ input: unknown; dataAsOf: Date }> {
  const fundamentals = await buildFundamentalsBlock(instrument);
  const dataGaps = [...fundamentals.dataGaps];

  // Position context (quantity, average cost) — average-cost method, same
  // pure function the Holdings table itself uses.
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  let position: { quantity: number; avgCostPerUnit: number | null; currency: string } | null =
    null;
  if (portfolio) {
    const transactions = await prisma.transaction.findMany({
      where: { portfolioId: portfolio.id, instrumentId: instrument.id },
    });
    const holding = computeHoldings(transactions.map(fromPrismaTransaction)).find(
      (h) => h.instrumentId === instrument.id,
    );
    if (holding) {
      position = {
        quantity: holding.quantity,
        avgCostPerUnit: holding.avgCostPerUnit,
        currency: holding.currency,
      };
    }
  }
  if (!position) {
    dataGaps.push("Position: this stock is not currently held in the portfolio.");
  }

  // Recent ThesisChecks for this instrument (any thesis, ACTIVE or CLOSED).
  const theses = await prisma.thesis.findMany({
    where: { userId, instrumentId: instrument.id },
    select: { id: true },
  });
  let thesisChecks: {
    createdAt: string;
    integrityScore: number;
    recommendation: string;
    evidence: unknown;
  }[] = [];
  if (theses.length > 0) {
    const checks = await prisma.thesisCheck.findMany({
      where: { thesisId: { in: theses.map((t) => t.id) } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    thesisChecks = checks.map((check) => ({
      createdAt: check.createdAt.toISOString(),
      integrityScore: check.integrityScore,
      recommendation: check.recommendation,
      evidence: check.evidence,
    }));
  }
  if (thesisChecks.length === 0) {
    dataGaps.push(
      "Thesis checks: no thesis has been recorded (or checked) for this stock, so there is no thesis-integrity history to weigh.",
    );
  }

  return {
    input: {
      instructions: SELL_ANALYSIS_INSTRUCTIONS,
      instrument: instrumentSummary(instrument),
      quote: fundamentals.quote,
      profile: fundamentals.profile,
      ratios: fundamentals.ratios,
      dividends: fundamentals.dividends,
      position,
      thesisChecks,
      dataGaps,
    },
    dataAsOf: fundamentals.dataAsOf,
  };
}

/**
 * Generate (or reuse, by input hash) a SELL_ANALYSIS for one instrument.
 * Its input additionally includes the user's recent ThesisChecks for this
 * instrument, with an honest gap noted when none exist.
 */
export async function runSellAnalysis(
  instrumentId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("ai-sell-analysis", userId), AI_GENERATION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsed = instrumentIdSchema.safeParse(instrumentId);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Pick a stock first.");
  }

  const instrument = await prisma.instrument.findUnique({ where: { id: parsed.data } });
  if (!instrument) return actionError("That stock could not be found.");

  const result = await runAnalysis({
    userId,
    type: "SELL_ANALYSIS",
    subjectType: "instrument",
    subjectId: instrument.id,
    model: ANALYSIS_MODEL,
    buildInput: () => buildSellAnalysisInput(userId, instrument),
    schema: sellAnalysisSchema,
  });

  if (!result.ok) return actionError(result.message);

  revalidatePath("/committee");
  return actionOk({ id: result.analysis.id });
}

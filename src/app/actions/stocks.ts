"use server";

// Watchlist toggling and STOCK_SCORE generation for /stocks and
// /stocks/[id], always scoped to the signed-in user (BUILD-PLAN.md Phase 3).
// Follows the same skeleton as src/app/actions/transactions.ts: session →
// rate limit → zod parse → existence/ownership check → mutate → revalidate.

import { revalidatePath } from "next/cache";
import type { Instrument } from "@prisma/client";
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
  getNews,
  getProfile,
  getQuote,
  type NewsArticle,
} from "@/lib/data";
import { ANALYSIS_MODEL, FAST_MODEL } from "@/lib/ai/client";
import { runAnalysis } from "@/lib/ai/analysis";
import { newsSummarySchema, stockScoreSchema } from "@/lib/ai/schemas";
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

function revalidateStockPages(instrumentId: string) {
  revalidatePath("/stocks");
  revalidatePath(`/stocks/${instrumentId}`);
  revalidatePath("/watchlist");
}

async function instrumentExists(instrumentId: string): Promise<boolean> {
  const count = await prisma.instrument.count({ where: { id: instrumentId } });
  return count > 0;
}

/** Start watching an instrument. Idempotent — watching twice is a no-op, not an error. */
export async function addToWatchlist(
  instrumentId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(
    userKey("watchlist-write", userId),
    WRITE_ACTION_RATE_LIMIT,
  );
  if (!limited.ok)
    return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsed = instrumentIdSchema.safeParse(instrumentId);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Pick a stock first.",
    );
  }
  if (!(await instrumentExists(parsed.data))) {
    return actionError("That stock could not be found.");
  }

  await prisma.watchlistItem.upsert({
    where: { userId_instrumentId: { userId, instrumentId: parsed.data } },
    create: { userId, instrumentId: parsed.data },
    update: {},
  });

  revalidateStockPages(parsed.data);
  return actionOk({ id: parsed.data });
}

/** Stop watching an instrument. Scoped to the signed-in user's own row — nothing else can be touched. */
export async function removeFromWatchlist(
  instrumentId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(
    userKey("watchlist-write", userId),
    WRITE_ACTION_RATE_LIMIT,
  );
  if (!limited.ok)
    return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsed = instrumentIdSchema.safeParse(instrumentId);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Pick a stock first.",
    );
  }

  await prisma.watchlistItem.deleteMany({
    where: { userId, instrumentId: parsed.data },
  });

  revalidateStockPages(parsed.data);
  return actionOk({ id: parsed.data });
}

// ---------------------------------------------------------------------------
// STOCK_SCORE generation
// ---------------------------------------------------------------------------

/**
 * What the AI sees for a STOCK_SCORE run. Built from the SAME barrel calls
 * and the SAME pure ratio functions the ratio strip displays, so the number
 * the owner sees on screen is exactly what the model reasoned about. Any
 * block that couldn't be fetched is listed in `dataGaps` in plain English —
 * the model is told what's missing rather than left to guess (golden rule).
 *
 * `instructions` exists because runAnalysis's shared engine (src/lib/ai/
 * analysis.ts) sends only the generic analyst preamble + this input as the
 * user message — there's no separate per-AiAnalysisType task slot. Embedding
 * the task framing directly in the input is how a caller supplies it without
 * touching the shared engine.
 */
type StockScoreInput = {
  instructions: string;
  instrument: {
    ticker: string;
    name: string;
    market: string;
    type: string;
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

const STOCK_SCORE_INSTRUCTIONS =
  "Produce a STOCK_SCORE analysis for this ONE stock (not the investor's whole " +
  "portfolio): an overall investment-quality score (0-100) and seven subscores, " +
  "using the same 7-dimension framework a whole-portfolio Health Score uses but " +
  "interpreted at the single-company level — diversification (how diversified " +
  "THIS COMPANY's own revenue/business lines/geography are), valuation (is the " +
  "price reasonable versus fundamentals), quality (profitability, margins, " +
  "balance-sheet health), concentration (customer/revenue/geographic " +
  "concentration risk within this company), dividendQuality (sustainability and " +
  "coverage of its dividend, if any), risk (volatility, leverage, sector/macro " +
  "risk), cash (balance-sheet liquidity and cash generation). Then list concrete " +
  "strengths and evidence-backed recommendations for an investor considering or " +
  "holding this stock.";

async function buildStockScoreInput(
  instrument: Instrument,
): Promise<{ input: StockScoreInput; dataAsOf: Date }> {
  const ref = {
    id: instrument.id,
    ticker: instrument.ticker,
    market: instrument.market,
    currency: instrument.currency,
  };
  const now = new Date();

  const [
    quoteResult,
    profileResult,
    incomeResult,
    balanceResult,
    dividendResult,
  ] = await Promise.all([
    getQuote(ref),
    getProfile(ref),
    getFinancialStatements(ref, "income", "annual"),
    getFinancialStatements(ref, "balance", "annual"),
    getDividendHistory(ref),
  ]);

  const dataGaps: string[] = [];
  const price = quoteResult.ok ? quoteResult.data.price : null;
  if (!quoteResult.ok)
    dataGaps.push(
      `Current price: ${quoteResult.message ?? quoteResult.unavailable}`,
    );
  if (!profileResult.ok) {
    dataGaps.push(
      `Company profile: ${profileResult.message ?? profileResult.unavailable}`,
    );
  }

  const income = incomeResult.ok
    ? latestStatementRow(incomeResult.data.rows)
    : undefined;
  const balance = balanceResult.ok
    ? latestStatementRow(balanceResult.data.rows)
    : undefined;
  if (!incomeResult.ok)
    dataGaps.push(
      `Income statement: ${incomeResult.message ?? incomeResult.unavailable}`,
    );
  if (!balanceResult.ok)
    dataGaps.push(
      `Balance sheet: ${balanceResult.message ?? balanceResult.unavailable}`,
    );

  const trailingDividendPerShare = dividendResult.ok
    ? sumTrailingDividendsPerShare(dividendResult.data, now)
    : null;
  if (!dividendResult.ok) {
    dataGaps.push(
      `Dividend history: ${dividendResult.message ?? dividendResult.unavailable}`,
    );
  }

  const peRatio = computePriceToEarnings(price, income);
  const pbRatio = computePriceToBook(price, income, balance);
  const dividendYield = computeDividendYield(price, trailingDividendPerShare);
  const debtToEquity = computeDebtToEquity(balance);
  const roe = computeReturnOnEquity(income, balance);
  const currentRatio = computeCurrentRatio(balance);

  const dataAsOf = quoteResult.ok ? quoteResult.data.asOf : now;

  return {
    input: {
      instructions: STOCK_SCORE_INSTRUCTIONS,
      instrument: {
        ticker: instrument.ticker,
        name: instrument.name,
        market: instrument.market,
        type: instrument.type,
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
        : {
            ok: false,
            reason: profileResult.message ?? profileResult.unavailable,
          },
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
 * Generate (or reuse, by input hash) a STOCK_SCORE analysis for one
 * instrument. THE AI RULE: this only ever runs from an explicit button
 * press — the page never calls this on render.
 */
export async function generateStockScore(
  instrumentId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  // AI generation reaches an external, metered API — same burst limit as
  // every other AI-generation action (see health-score.ts).
  const limited = rateLimit(
    userKey("ai-generate", userId),
    AI_GENERATION_RATE_LIMIT,
  );
  if (!limited.ok)
    return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsed = instrumentIdSchema.safeParse(instrumentId);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Pick a stock first.",
    );
  }

  const instrument = await prisma.instrument.findUnique({
    where: { id: parsed.data },
  });
  if (!instrument) return actionError("That stock could not be found.");

  const result = await runAnalysis({
    userId,
    type: "STOCK_SCORE",
    subjectType: "instrument",
    subjectId: instrument.id,
    model: ANALYSIS_MODEL,
    buildInput: () => buildStockScoreInput(instrument),
    schema: stockScoreSchema,
  });

  if (!result.ok) return actionError(result.message);

  revalidatePath(`/stocks/${instrument.id}`);
  return actionOk({ id: result.analysis.id });
}

// ---------------------------------------------------------------------------
// NEWS_SUMMARY generation
// ---------------------------------------------------------------------------

const NEWS_SUMMARY_INSTRUCTIONS =
  "Produce a NEWS_SUMMARY for this stock's recent news coverage (the articles " +
  "below, most recent first). Summarize what happened and why it matters for " +
  "an investor. Only when an active thesis statement is given, judge whether " +
  "this news affects that thesis specifically (thesisImpact) — write null for " +
  "thesisImpact when no thesis is given, never invent one. Give a direct, " +
  "plain answer for whether the investor should care right now. Pull 2-4 " +
  "short, verbatim quotes from the articles, each with its source name when " +
  "known (write null for a quote's source when the article didn't give you " +
  "one — never guess a publication).";

async function buildNewsSummaryInput(
  instrument: Instrument,
  articles: NewsArticle[],
  activeThesisStatement: string | null,
): Promise<{ input: unknown; dataAsOf: Date }> {
  const sorted = [...articles].sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
  );
  return {
    input: {
      instructions: NEWS_SUMMARY_INSTRUCTIONS,
      instrument: {
        ticker: instrument.ticker,
        name: instrument.name,
        market: instrument.market,
      },
      activeThesisStatement,
      articles: sorted.map((article) => ({
        title: article.title,
        text: article.text,
        source: article.source,
        publishedAt: article.publishedAt.toISOString(),
      })),
    },
    dataAsOf: sorted[0]?.publishedAt ?? new Date(),
  };
}

/**
 * Generate (or reuse, by input hash) a NEWS_SUMMARY for one instrument. Fails
 * honestly, WITHOUT calling the model, when there is nothing to summarize —
 * no live market-data connection for this instrument, or no recent articles
 * found — rather than asking the AI to write about an empty input.
 */
export async function generateNewsSummary(
  instrumentId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("ai-news-summary", userId), AI_GENERATION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsed = instrumentIdSchema.safeParse(instrumentId);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Pick a stock first.");
  }

  const instrument = await prisma.instrument.findUnique({ where: { id: parsed.data } });
  if (!instrument) return actionError("That stock could not be found.");

  const ref = {
    id: instrument.id,
    ticker: instrument.ticker,
    market: instrument.market,
    currency: instrument.currency,
  };
  const newsResult = await getNews(ref);
  if (!newsResult.ok) {
    return actionError(
      newsResult.message ?? "News summaries aren't available for this stock right now.",
    );
  }

  const activeThesis = await prisma.thesis.findFirst({
    where: { userId, instrumentId: instrument.id, status: "ACTIVE" },
  });

  const result = await runAnalysis({
    userId,
    type: "NEWS_SUMMARY",
    subjectType: "instrument",
    subjectId: instrument.id,
    model: FAST_MODEL,
    buildInput: () =>
      buildNewsSummaryInput(instrument, newsResult.data, activeThesis?.statement ?? null),
    schema: newsSummarySchema,
  });

  if (!result.ok) return actionError(result.message);

  revalidatePath(`/stocks/${instrument.id}`);
  return actionOk({ id: result.analysis.id });
}

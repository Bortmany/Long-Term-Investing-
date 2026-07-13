"use server";

// The Investment Committee (Phase 5, ui-spec §6): convene the six-persona
// committee on an instrument, and run the two single-model "should I buy" /
// "should I sell" analyses that sit alongside it.
//
// AI RULE (docs/CONVENTIONS.md): runCommittee/runAnalysis are called ONLY
// from the three actions below — explicit user clicks on "Convene
// Committee" / "Run buy analysis" / "Run sell analysis" — never from a
// page's render path. Pages only READ the persisted AiAnalysis rows.
//
// GOLDEN RULE: buildInput never fabricates market data. Each source that is
// unavailable is passed to the model as `null`, not a made-up figure, and the
// data's "as of" date is the newest real asOf among the sources we did get.
//
// SECURITY RULE: every query here that touches user-owned data (portfolios,
// transactions, theses, thesis checks) is scoped to the signed-in user's id.
// Instrument/AiAnalysis-for-an-instrument reads are shared reference data —
// same precedent as stock-score.ts/theses.ts — so those don't need a userId
// filter, just the signed-in check.

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { ANALYSIS_MODEL } from "@/lib/ai/client";
import { runAnalysis } from "@/lib/ai/analysis";
import { runCommittee } from "@/lib/ai/committee-engine";
import { buyAnalysisSchema, sellAnalysisSchema } from "@/lib/ai/schemas";
import {
  getDividendHistory,
  getFinancialStatements,
  getProfile,
  getQuote,
  type InstrumentRef,
  type UnavailableReason,
} from "@/lib/data";
import {
  computePortfolioValue,
  fromPrismaFxRate,
  fromPrismaPriceCache,
  fromPrismaTransaction,
  type ValuedHolding,
} from "@/lib/portfolio";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getSessionUserId } from "@/lib/user-portfolio";

const INSTRUMENT_NOT_FOUND_ERROR = "That instrument could not be found.";

/** Maps a runAnalysis/runCommittee failure to a plain-English sentence. */
function mapUnavailableToMessage(reason: UnavailableReason): string {
  return reason === "no_api_key"
    ? "AI features are turned off."
    : "Something went wrong generating this analysis.";
}

/** Only the fields a valid (`ok: true`) holding valuation carries — never a fabricated figure. */
function positionInputFor(holding: ValuedHolding | undefined): {
  quantity: number;
  valuation: { marketValue: number; price: number; priceCurrency: string; asOf: string | null };
} | null {
  if (!holding || !holding.valuation.ok) return null;
  // A holding's valuation source is always a real price source (never the
  // cash-only "derived" kind), but the type is shared with ValueSource — so
  // narrow defensively instead of asserting.
  const { source } = holding.valuation;
  const asOf = "asOf" in source ? source.asOf.toISOString() : null;
  return {
    quantity: holding.quantity,
    valuation: {
      marketValue: holding.valuation.marketValue,
      price: holding.valuation.price,
      priceCurrency: holding.valuation.priceCurrency,
      asOf,
    },
  };
}

/** Finds this user's (read-only, never-created) portfolio holding for one instrument, if any. */
async function findHoldingFor(
  userId: string,
  instrumentId: string,
): Promise<ValuedHolding | undefined> {
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (!portfolio) return undefined;

  const [transactionRows, priceRows, fxRows] = await Promise.all([
    prisma.transaction.findMany({ where: { portfolioId: portfolio.id } }),
    prisma.priceCache.findMany({ where: { instrumentId } }),
    prisma.fxRate.findMany(),
  ]);

  const portfolioValue = computePortfolioValue({
    transactions: transactionRows.map(fromPrismaTransaction),
    prices: priceRows.map(fromPrismaPriceCache),
    fxRates: fxRows.map(fromPrismaFxRate),
    baseCurrency: portfolio.baseCurrency,
  });

  return portfolioValue.holdings.find((h) => h.instrumentId === instrumentId);
}

/** Shared market-data gather + null-handling, identical shape to stock-score.ts/theses.ts. */
async function gatherMarketData(ref: InstrumentRef) {
  const [profileR, quoteR, incomeR, balanceR, cashR, dividendR] = await Promise.all([
    getProfile(ref),
    getQuote(ref),
    getFinancialStatements(ref, "income", "annual"),
    getFinancialStatements(ref, "balance", "annual"),
    getFinancialStatements(ref, "cash-flow", "annual"),
    getDividendHistory(ref),
  ]);

  const asOfDates: Date[] = [];
  if (profileR.ok) asOfDates.push(profileR.data.asOf);
  if (quoteR.ok) asOfDates.push(quoteR.data.asOf);
  if (incomeR.ok) asOfDates.push(incomeR.data.asOf);
  if (balanceR.ok) asOfDates.push(balanceR.data.asOf);
  if (cashR.ok) asOfDates.push(cashR.data.asOf);
  if (dividendR.ok) {
    for (const payment of dividendR.data) asOfDates.push(payment.exDate);
  }
  const dataAsOf =
    asOfDates.length > 0
      ? new Date(Math.max(...asOfDates.map((d) => d.getTime())))
      : new Date();

  return {
    dataAsOf,
    profile: profileR.ok
      ? {
          name: profileR.data.name,
          sector: profileR.data.sector,
          industry: profileR.data.industry,
          country: profileR.data.country,
          description: profileR.data.description,
          marketCap: profileR.data.marketCap,
          currency: profileR.data.currency,
        }
      : null,
    quote: quoteR.ok
      ? {
          price: quoteR.data.price,
          currency: quoteR.data.currency,
          asOf: quoteR.data.asOf.toISOString(),
        }
      : null,
    statements: {
      income: incomeR.ok ? incomeR.data.rows : null,
      balance: balanceR.ok ? balanceR.data.rows : null,
      cashFlow: cashR.ok ? cashR.data.rows : null,
    },
    dividends: dividendR.ok
      ? dividendR.data.map((payment) => ({
          exDate: payment.exDate.toISOString(),
          amountPerShare: payment.amountPerShare,
          currency: payment.currency,
        }))
      : null,
  };
}

/**
 * Convene the six-persona Investment Committee on one instrument. Returns
 * `{ reused }` so the caller can tell whether anything new was generated;
 * the persisted AiAnalysis(COMMITTEE) row is read back by the page after
 * revalidation.
 */
export async function conveneCommittee(
  instrumentId: string,
): Promise<ActionResult<{ reused: boolean }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  if (!instrumentId || typeof instrumentId !== "string") {
    return actionError(INSTRUMENT_NOT_FOUND_ERROR);
  }

  const instrument = await prisma.instrument.findUnique({ where: { id: instrumentId } });
  if (!instrument) return actionError(INSTRUMENT_NOT_FOUND_ERROR);

  const ref: InstrumentRef = {
    id: instrument.id,
    ticker: instrument.ticker,
    market: instrument.market,
    currency: instrument.currency,
  };

  const [market, activeThesis, holding] = await Promise.all([
    gatherMarketData(ref),
    prisma.thesis.findFirst({ where: { instrumentId, userId, status: "ACTIVE" } }),
    findHoldingFor(userId, instrumentId),
  ]);

  const input = {
    instrument: {
      ticker: instrument.ticker,
      name: instrument.name,
      market: instrument.market,
      currency: instrument.currency,
      type: instrument.type,
      sector: instrument.sector,
      country: instrument.country,
    },
    profile: market.profile,
    quote: market.quote,
    statements: market.statements,
    dividends: market.dividends,
    thesis: activeThesis
      ? { statement: activeThesis.statement, statedOn: activeThesis.createdAt.toISOString() }
      : null,
    position: positionInputFor(holding),
  };

  const result = await runCommittee({
    userId,
    subjectId: instrument.id,
    model: ANALYSIS_MODEL,
    input,
    dataAsOf: market.dataAsOf,
  });

  if (!result.ok) {
    return actionError(mapUnavailableToMessage(result.unavailable));
  }

  revalidatePath("/committee");
  return actionOk({ reused: result.data.reused });
}

export type BuyAnalysisAssumptions = {
  intendedPrice?: number | null;
  horizon?: string | null;
  riskTolerance?: string | null;
  philosophy?: string | null;
};

/**
 * Generate (or reuse) the AI BUY_ANALYSIS for one instrument under the
 * investor's own stated assumptions. Different assumption combinations are
 * genuinely different inputs (they are folded into the hashed payload), so
 * each distinct set of assumptions gets its own persisted row rather than
 * overwriting a prior run.
 */
export async function runBuyAnalysis(
  instrumentId: string,
  assumptions: BuyAnalysisAssumptions,
): Promise<ActionResult<{ reused: boolean }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  if (!instrumentId || typeof instrumentId !== "string") {
    return actionError(INSTRUMENT_NOT_FOUND_ERROR);
  }

  const instrument = await prisma.instrument.findUnique({ where: { id: instrumentId } });
  if (!instrument) return actionError(INSTRUMENT_NOT_FOUND_ERROR);

  const ref: InstrumentRef = {
    id: instrument.id,
    ticker: instrument.ticker,
    market: instrument.market,
    currency: instrument.currency,
  };

  const result = await runAnalysis({
    userId,
    type: "BUY_ANALYSIS",
    subjectType: "instrument",
    subjectId: instrument.id,
    model: ANALYSIS_MODEL,
    schema: buyAnalysisSchema,
    buildInput: async () => {
      const market = await gatherMarketData(ref);
      const input = {
        instrument: {
          ticker: instrument.ticker,
          name: instrument.name,
          market: instrument.market,
          currency: instrument.currency,
          type: instrument.type,
          sector: instrument.sector,
          country: instrument.country,
        },
        profile: market.profile,
        quote: market.quote,
        statements: market.statements,
        dividends: market.dividends,
        assumptions: {
          intendedPrice: assumptions.intendedPrice ?? null,
          horizon: assumptions.horizon ?? null,
          riskTolerance: assumptions.riskTolerance ?? null,
          philosophy: assumptions.philosophy ?? null,
        },
      };
      return { input, dataAsOf: market.dataAsOf };
    },
  });

  if (!result.ok) {
    return actionError(mapUnavailableToMessage(result.unavailable));
  }

  revalidatePath("/committee");
  return actionOk({ reused: result.data.reused });
}

/**
 * Generate (or reuse) the AI SELL_ANALYSIS for one instrument the user
 * currently holds. Defensively re-verifies the position is actually held
 * (mirrors the UI's disabled-button gate — never trust the client).
 */
export async function runSellAnalysis(
  instrumentId: string,
): Promise<ActionResult<{ reused: boolean }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  if (!instrumentId || typeof instrumentId !== "string") {
    return actionError(INSTRUMENT_NOT_FOUND_ERROR);
  }

  const instrument = await prisma.instrument.findUnique({ where: { id: instrumentId } });
  if (!instrument) return actionError(INSTRUMENT_NOT_FOUND_ERROR);

  const holding = await findHoldingFor(userId, instrumentId);
  if (!holding) {
    return actionError("You don't currently hold this position.");
  }

  const ref: InstrumentRef = {
    id: instrument.id,
    ticker: instrument.ticker,
    market: instrument.market,
    currency: instrument.currency,
  };

  const result = await runAnalysis({
    userId,
    type: "SELL_ANALYSIS",
    subjectType: "instrument",
    subjectId: instrument.id,
    model: ANALYSIS_MODEL,
    schema: sellAnalysisSchema,
    buildInput: async () => {
      const market = await gatherMarketData(ref);

      // A broken thesis should make the sell case stronger even if the
      // thesis was since closed — so this looks across ANY of this user's
      // theses for this instrument, active or closed.
      const thesisChecks = await prisma.thesisCheck.findMany({
        where: { thesis: { instrumentId, userId } },
        orderBy: { createdAt: "desc" },
        take: 3,
      });

      const input = {
        instrument: {
          ticker: instrument.ticker,
          name: instrument.name,
          market: instrument.market,
          currency: instrument.currency,
          type: instrument.type,
          sector: instrument.sector,
          country: instrument.country,
        },
        profile: market.profile,
        quote: market.quote,
        statements: market.statements,
        dividends: market.dividends,
        position: positionInputFor(holding),
        thesisChecks: thesisChecks.map((check) => ({
          createdAt: check.createdAt.toISOString(),
          integrityScore: check.integrityScore,
          recommendation: check.recommendation,
          dataAsOf: check.dataAsOf.toISOString(),
        })),
      };
      return { input, dataAsOf: market.dataAsOf };
    },
  });

  if (!result.ok) {
    return actionError(mapUnavailableToMessage(result.unavailable));
  }

  revalidatePath("/committee");
  return actionOk({ reused: result.data.reused });
}

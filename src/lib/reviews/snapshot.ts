// Builds the Weekly Review's AI input: holdings with current values (honest
// sources), allocation, returns, dividends, plus the DELTA section comparing
// against the previous snapshot (BUILD-PLAN.md Phase 6). Mirrors the shape
// of src/app/actions/health-score.ts's inline builder and
// src/app/actions/committee.ts's buildFundamentalsBlock: real I/O through
// prisma + the portfolio math library, every figure honestly sourced, every
// gap listed in plain English rather than guessed.

import type { Portfolio } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computeAllocation,
  computePortfolioValue,
  computeReturns,
  computeTrailingDividendIncome,
  fromPrismaFxRate,
  fromPrismaPriceCache,
  fromPrismaTransaction,
  type AllocatableHolding,
} from "@/lib/portfolio";
import { computeReviewDelta, type ReviewDelta, type ReviewSectorDelta, type ReviewSnapshot } from "./delta";

const WEEKLY_REVIEW_INSTRUCTIONS =
  "Produce a WEEKLY_REVIEW: a plain-English weekly check-in on this investor's " +
  "whole portfolio. Use the CURRENT snapshot below (holdings, allocation, " +
  "returns, dividends) together with the DELTA section, which compares this " +
  "week's numbers against the investor's last recorded weekly review (or says " +
  "there is no prior week yet, for a first review — never invent a comparison " +
  "when delta.hasPrior is false). Write: an overall summary; newRisks that " +
  "genuinely emerged or worsened this week (an empty list is fine and honest " +
  "when nothing new stands out); improvedHoldings and weakenedHoldings, each a " +
  "ticker plus a one-line reason drawn from the real price/value changes in " +
  "the delta section — only use tickers that actually appear in the holdings " +
  "list, never invent one; a plain-English allocationDrift paragraph " +
  "describing how the mix of sectors shifted in words (the exact per-sector " +
  "percentages are already computed for you in delta.sectorAllocation and are " +
  "shown to the investor separately as a table — describe the shift " +
  "qualitatively, don't restate the exact numbers as if reproducing them " +
  "yourself); suggestedActions the investor might consider; and a short, calm " +
  "behavioralNote — one observation about the investor's own behavior pattern " +
  "(e.g. chasing recent winners, concentration creeping up, ignoring cash " +
  "drag), stated gently, never alarmist.";

function describeMissing(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"} could not be valued (missing price or exchange rate).`;
}

export async function buildWeeklyReviewInput(params: {
  portfolio: Portfolio;
  now: Date;
  previousSnapshot: ReviewSnapshot | null;
}): Promise<{
  input: unknown;
  dataAsOf: Date;
  snapshot: ReviewSnapshot;
  sectorDrift: ReviewSectorDelta[] | null;
}> {
  const { portfolio, now, previousSnapshot } = params;

  const transactionRows = await prisma.transaction.findMany({
    where: { portfolioId: portfolio.id },
  });
  const instrumentIds = [
    ...new Set(
      transactionRows.map((t) => t.instrumentId).filter((id): id is string => id !== null),
    ),
  ];

  const [priceRows, fxRows, instrumentRows] = await Promise.all([
    prisma.priceCache.findMany({ where: { instrumentId: { in: instrumentIds } } }),
    prisma.fxRate.findMany(),
    prisma.instrument.findMany({ where: { id: { in: instrumentIds } } }),
  ]);

  const transactions = transactionRows.map(fromPrismaTransaction);
  const fxRates = fxRows.map(fromPrismaFxRate);
  const instrumentById = new Map(instrumentRows.map((i) => [i.id, i]));

  const portfolioValue = computePortfolioValue({
    transactions,
    prices: priceRows.map(fromPrismaPriceCache),
    fxRates,
    baseCurrency: portfolio.baseCurrency,
  });
  const returns = computeReturns({
    transactions,
    currentValue: portfolioValue.totalValue,
    baseCurrency: portfolio.baseCurrency,
    fxRates,
  });
  const dividendIncome = computeTrailingDividendIncome(transactions, {
    baseCurrency: portfolio.baseCurrency,
    fxRates,
    now,
  });

  const dataGaps: string[] = [];
  if (!portfolioValue.complete) {
    dataGaps.push(describeMissing(portfolioValue.missing.length, "holding"));
  }
  if (!dividendIncome.complete) {
    dataGaps.push(
      `${dividendIncome.missing.length} dividend payment(s) could not be converted to the base currency.`,
    );
  }
  if (!returns.complete) {
    dataGaps.push(
      `${returns.missing.length} contribution/dividend amount(s) could not be converted to the base currency.`,
    );
  }

  // Only holdings that could actually be valued feed the AI (and the
  // snapshot future weeks diff against) — same discipline as
  // buildHealthScoreInput: an unvalued position is left out here the same
  // way it's left out of every total on the Dashboard, never padded.
  const allocatable: AllocatableHolding[] = [];
  const holdingRows: {
    instrumentId: string;
    ticker: string;
    name: string;
    marketValue: number;
    weightPercent: number;
    source: { kind: string; asOf: string | null };
  }[] = [];

  for (const holding of portfolioValue.holdings) {
    if (!holding.valuation.ok) continue;
    const instrument = instrumentById.get(holding.instrumentId);
    if (!instrument) continue;
    allocatable.push({
      instrumentId: holding.instrumentId,
      marketValue: holding.valuation.marketValue,
      sector: instrument.sector,
      country: instrument.country,
      market: instrument.market,
    });
    holdingRows.push({
      instrumentId: holding.instrumentId,
      ticker: instrument.ticker,
      name: instrument.name,
      marketValue: holding.valuation.marketValue,
      weightPercent:
        portfolioValue.holdingsValue > 0
          ? (holding.valuation.marketValue / portfolioValue.holdingsValue) * 100
          : 0,
      source: {
        kind: holding.valuation.source.kind,
        asOf: holding.valuation.source.kind === "derived" ? null : holding.valuation.source.asOf.toISOString(),
      },
    });
  }

  const bySector = computeAllocation(allocatable, "sector");

  const snapshot: ReviewSnapshot = {
    baseCurrency: portfolio.baseCurrency,
    totalValue: portfolioValue.totalValue,
    holdingsValue: portfolioValue.holdingsValue,
    cashValue: portfolioValue.cashValue,
    holdings: holdingRows.map((h) => ({
      instrumentId: h.instrumentId,
      ticker: h.ticker,
      marketValue: h.marketValue,
    })),
    sectorAllocation: bySector.slices.map((s) => ({ label: s.label, sharePercent: s.sharePercent })),
    trailingDividendIncome: dividendIncome.total,
  };

  const delta: ReviewDelta = computeReviewDelta(snapshot, previousSnapshot);
  const sectorDrift = delta.hasPrior ? delta.sectorAllocation : null;

  // dataAsOf: the OLDEST price date behind this analysis — never overstate
  // freshness by reporting the newest of a mixed batch (same rule
  // buildHealthScoreInput uses).
  const priceDates = portfolioValue.holdings
    .map((h) => (h.valuation.ok && h.valuation.source.kind !== "derived" ? h.valuation.source.asOf : null))
    .filter((d): d is Date => d !== null);
  const dataAsOf =
    priceDates.length > 0 ? priceDates.reduce((oldest, d) => (d < oldest ? d : oldest)) : now;

  const input = {
    instructions: WEEKLY_REVIEW_INSTRUCTIONS,
    portfolio: {
      baseCurrency: portfolio.baseCurrency,
      totalValue: portfolioValue.totalValue,
      holdingsValue: portfolioValue.holdingsValue,
      cashValue: portfolioValue.cashValue,
      complete: portfolioValue.complete,
    },
    holdings: holdingRows,
    allocationBySector: bySector.slices,
    returns: {
      withDividends: returns.withDividends,
      withoutDividends: returns.withoutDividends,
    },
    dividends: {
      trailingIncome: dividendIncome.total,
      complete: dividendIncome.complete,
    },
    delta,
    dataGaps,
  };

  return { input, dataAsOf, snapshot, sectorDrift };
}

// Pre-computation for the Portfolio Health Score (BUILD-PLAN Phase 3).
//
// Assembles the portfolio's LOCAL, already-typed metrics into the plain object
// the AI model sees. It reuses the exact same load-and-value path the
// dashboard/portfolio pages use (scoped to one portfolio), converts Decimals
// at the edge via the fromPrisma* adapters, and runs everything through the
// pure portfolio math library.
//
// GOLDEN RULE for this payload: every number here comes from the typed
// portfolio/market-data layer. Where a figure genuinely can't be computed
// (no holdings, no price, no FX rate), it is represented HONESTLY — as null
// or an explicit "unvalued" entry — never padded with a fabricated value. The
// Health Score itself is an AI judgment produced downstream; this file only
// feeds it real, sourced inputs.

import type { Portfolio } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  computeAllocation,
  computeConcentration,
  computeDividendsByHolding,
  computePortfolioValue,
  computeTrailingDividendIncome,
  fromPrismaFxRate,
  fromPrismaPriceCache,
  fromPrismaTransaction,
  type AllocatableHolding,
  type ConcentrationHolding,
} from "@/lib/portfolio";

/** Round to a fixed number of decimals so float noise never churns the input hash. */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Round a nullable figure, passing null (typed "not applicable") straight through. */
function roundOrNull(value: number | null, decimals: number): number | null {
  return value === null ? null : round(value, decimals);
}

/**
 * Build the Health Score model input for one portfolio, plus the "as of" date
 * of the underlying market data. Shape is deterministic (stable keys, rounded
 * numbers) so `runAnalysis` reuses a cached analysis whenever the inputs are
 * unchanged.
 */
export async function buildHealthScoreInput(
  portfolio: Portfolio,
): Promise<{ input: unknown; dataAsOf: Date }> {
  const base = portfolio.baseCurrency;

  const transactionRows = await prisma.transaction.findMany({
    where: { portfolioId: portfolio.id },
  });

  const instrumentIds = [
    ...new Set(
      transactionRows
        .map((t) => t.instrumentId)
        .filter((id): id is string => id !== null),
    ),
  ];

  const [priceRows, fxRows, instrumentRows] = await Promise.all([
    prisma.priceCache.findMany({ where: { instrumentId: { in: instrumentIds } } }),
    prisma.fxRate.findMany(),
    prisma.instrument.findMany({ where: { id: { in: instrumentIds } } }),
  ]);

  const transactions = transactionRows.map(fromPrismaTransaction);
  const prices = priceRows.map(fromPrismaPriceCache);
  const fxRates = fxRows.map(fromPrismaFxRate);
  const instrumentById = new Map(instrumentRows.map((i) => [i.id, i]));

  const portfolioValue = computePortfolioValue({
    transactions,
    prices,
    fxRates,
    baseCurrency: base,
  });

  // --- Allocation (only holdings that could actually be valued) ---
  const allocatable: AllocatableHolding[] = portfolioValue.holdings.flatMap(
    (holding) => {
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
    },
  );

  const allocationOf = (key: "sector" | "country" | "market") =>
    computeAllocation(allocatable, key).slices.map((slice) => ({
      label: slice.label,
      sharePercent: round(slice.sharePercent, 2),
    }));

  // --- Concentration (position HHI, top-holding weight, sector HHI) ---
  const concentrationHoldings: ConcentrationHolding[] = allocatable.map((h) => ({
    value: h.marketValue,
    sector: h.sector,
  }));
  const concentration = computeConcentration(concentrationHoldings);

  // --- Dividends (all pure transaction math) ---
  const dividendIncome = computeTrailingDividendIncome(transactions, {
    baseCurrency: base,
    fxRates,
  });
  const dividendsByHolding = computeDividendsByHolding(transactions, {
    baseCurrency: base,
    fxRates,
  });

  // Trailing dividend yield only if the total value is a positive real number;
  // otherwise it is genuinely not derivable → null, never a fake 0.
  const dividendYieldPercent =
    portfolioValue.totalValue > 0
      ? round((dividendIncome.total / portfolioValue.totalValue) * 100, 2)
      : null;

  // --- Currency exposure (share of total value in each currency, base-currency
  // terms). Non-base currencies are the FX exposure the model reasons about. ---
  const valueByCurrency = new Map<string, number>();
  for (const holding of portfolioValue.holdings) {
    if (!holding.valuation.ok) continue;
    valueByCurrency.set(
      holding.currency,
      (valueByCurrency.get(holding.currency) ?? 0) + holding.valuation.marketValue,
    );
  }
  for (const cash of portfolioValue.cash) {
    if (!cash.converted.ok) continue;
    valueByCurrency.set(
      cash.currency,
      (valueByCurrency.get(cash.currency) ?? 0) + cash.converted.value,
    );
  }
  const totalValued = portfolioValue.totalValue;
  const fxExposure = [...valueByCurrency.entries()]
    .filter(([currency]) => currency !== base)
    .map(([currency, value]) => ({
      currency,
      sharePercent: totalValued > 0 ? round((value / totalValued) * 100, 2) : 0,
    }))
    .sort((a, b) => b.sharePercent - a.sharePercent);

  // --- Cash share of the portfolio (derived; null when nothing is valued) ---
  const cashPercent =
    totalValued > 0 ? round((portfolioValue.cashValue / totalValued) * 100, 2) : null;

  // --- Positions that could NOT be valued: reported honestly, never dropped
  // silently or padded with a guess. ---
  const unvaluedHoldings = portfolioValue.holdings
    .filter((holding) => !holding.valuation.ok)
    .map((holding) => ({
      ticker: instrumentById.get(holding.instrumentId)?.ticker ?? "unknown",
      reason: holding.valuation.ok ? "unknown" : holding.valuation.reason,
    }));

  const input = {
    baseCurrency: base,
    valuation: {
      totalValue: round(portfolioValue.totalValue, 3),
      holdingsValue: round(portfolioValue.holdingsValue, 3),
      cashValue: round(portfolioValue.cashValue, 3),
      cashPercent,
      valuedHoldingCount: allocatable.length,
      complete: portfolioValue.complete,
      unvaluedHoldings,
    },
    allocation: {
      bySector: allocationOf("sector"),
      byCountry: allocationOf("country"),
      byMarket: allocationOf("market"),
    },
    concentration: {
      // All three on the documented [0,1] HHI scale (see concentration.ts);
      // null means "not applicable — nothing to value", never a fake 0.
      holdingCount: concentration.holdingCount,
      positionHhi: roundOrNull(concentration.hhi, 4),
      topHoldingWeight: roundOrNull(concentration.topHoldingWeight, 4),
      sectorHhi: roundOrNull(concentration.sectorHhi, 4),
    },
    dividends: {
      trailing12mIncome: round(dividendIncome.total, 3),
      trailing12mYieldPercent: dividendYieldPercent,
      complete: dividendIncome.complete,
      byHolding: dividendsByHolding.rows.map((row) => ({
        ticker: instrumentById.get(row.instrumentId)?.ticker ?? "unknown",
        total: round(row.total, 3),
      })),
    },
    fxExposure,
  };

  // dataAsOf: the newest "as of" among the price and FX sources that actually
  // fed this computation (prices for held instruments + the FX rates). Falls
  // back to the newest transaction date, then to now, when there is no market
  // data yet — an honest timestamp, never an invented one.
  const candidateDates: Date[] = [
    ...prices.map((p) => p.asOf),
    ...fxRates.map((r) => r.asOf),
  ];
  let dataAsOf: Date;
  if (candidateDates.length > 0) {
    dataAsOf = candidateDates.reduce((a, b) => (b > a ? b : a));
  } else if (transactions.length > 0) {
    dataAsOf = transactions
      .map((t) => t.tradeDate)
      .reduce((a, b) => (b > a ? b : a));
  } else {
    dataAsOf = new Date();
  }

  return { input, dataAsOf };
}

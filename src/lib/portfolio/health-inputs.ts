// Portfolio Health Score — pure local pre-computation (BUILD-PLAN.md Phase 3:
// "explicit generate → local pre-computation (allocation %, top-holding +
// sector HHI concentration, dividend metrics, cash %, FX exposure) → Sonnet
// → AiAnalysis(HEALTH_SCORE)").
//
// Pure: no I/O. The caller (the generateHealthScore server action) already
// holds valued holdings + a trailing dividend total from the portfolio math
// library; this file only shapes that into the JSON object the AI sees as
// its input. Reuses computeAllocation for the sector/country/market slices
// so the Health Score's grouping logic can never drift from the Dashboard's
// donuts.

import type { Currency, Market } from "@prisma/client";
import { computeAllocation, type AllocatableHolding, type AllocationSlice } from "./allocation";

/** One valued holding, ready to feed the Health Score input builder. */
export type HealthScoreHolding = {
  instrumentId: string;
  ticker: string;
  name: string;
  /** Market value in the portfolio's base currency. */
  marketValue: number;
  sector: string | null;
  country: string | null;
  market: Market;
  /** The currency the instrument itself trades in (may differ from base). */
  currency: Currency;
};

export type HealthScoreHoldingShare = {
  ticker: string;
  name: string;
  /** Share of total holdings value (excludes cash), 0-100. */
  percentOfHoldings: number;
  sector: string | null;
  country: string | null;
  market: Market;
  currency: Currency;
};

export type ConcentrationSummary = {
  /** The single largest position, as a share of total holdings value. */
  topHolding: { ticker: string; percentOfHoldings: number } | null;
  /** Herfindahl-Hirschman Index over sector shares (0 = fully diversified, 10,000 = one sector). */
  sectorHHI: number;
  /** Sector allocation slices reused from computeAllocation (Unknown always last). */
  bySector: AllocationSlice[];
};

export type FxExposureSummary = {
  baseCurrency: Currency;
  /** Share of holdings value held in a currency other than the base currency. */
  nonBasePercent: number;
  byCurrency: { currency: Currency; percent: number }[];
};

export type DividendMetricsSummary = {
  /** Trailing 12-month dividend income, base currency. */
  trailingIncome: number;
  /** trailingIncome / holdingsValue, as a percent — null when there are no holdings. */
  yieldOnHoldingsPercent: number | null;
  /** How many distinct held instruments paid a dividend in the trailing window. */
  payingHoldingCount: number;
  /** payingHoldingCount / holdingCount, as a percent — null when there are no holdings. */
  payingHoldingPercent: number | null;
};

export type HealthScoreAiInput = {
  baseCurrency: Currency;
  totalValue: number;
  holdingsValue: number;
  cashValue: number;
  /** cashValue / totalValue, as a percent — 0 when totalValue is 0. */
  cashPercent: number;
  holdingCount: number;
  /** Each holding's share of holdings value, largest first. */
  holdings: HealthScoreHoldingShare[];
  allocation: {
    bySector: AllocationSlice[];
    byCountry: AllocationSlice[];
    byMarket: AllocationSlice[];
  };
  concentration: ConcentrationSummary;
  fxExposure: FxExposureSummary;
  dividends: DividendMetricsSummary;
};

/**
 * Herfindahl-Hirschman Index over a set of percentage shares (each 0-100,
 * expected to sum to ~100 for a full distribution). Returned on the standard
 * 0-10,000 scale: a single 100%-share position scores 10,000 (maximally
 * concentrated); several equal small shares approach 0 (maximally
 * diversified). An empty distribution scores 0.
 */
export function computeHHI(sharePercents: number[]): number {
  return sharePercents.reduce((sum, percent) => sum + percent * percent, 0);
}

/**
 * Build the JSON-serializable input the AI sees for a Portfolio Health Score
 * analysis, from data the caller has already valued/computed. Nothing here
 * touches the database — every number here is either a plain percentage
 * share or a total the caller already has in hand.
 */
export function buildHealthScoreInput(params: {
  baseCurrency: Currency;
  /** Sum of marketValue across `holdings` (already valued, base currency). */
  holdingsValue: number;
  cashValue: number;
  holdings: HealthScoreHolding[];
  /** instrumentIds that paid at least one dividend in the trailing window. */
  dividendPayingInstrumentIds: ReadonlySet<string>;
  /** Trailing 12-month dividend income, base currency. */
  trailingDividendIncome: number;
}): HealthScoreAiInput {
  const {
    baseCurrency,
    holdingsValue,
    cashValue,
    holdings,
    dividendPayingInstrumentIds,
    trailingDividendIncome,
  } = params;

  const totalValue = holdingsValue + cashValue;
  const holdingCount = holdings.length;
  const cashPercent = totalValue > 0 ? (cashValue / totalValue) * 100 : 0;

  const holdingRows: HealthScoreHoldingShare[] = [...holdings]
    .map((h) => ({
      ticker: h.ticker,
      name: h.name,
      percentOfHoldings: holdingsValue > 0 ? (h.marketValue / holdingsValue) * 100 : 0,
      sector: h.sector,
      country: h.country,
      market: h.market,
      currency: h.currency,
    }))
    .sort((a, b) => b.percentOfHoldings - a.percentOfHoldings);

  const topHolding =
    holdingRows.length > 0
      ? { ticker: holdingRows[0].ticker, percentOfHoldings: holdingRows[0].percentOfHoldings }
      : null;

  const allocatable: AllocatableHolding[] = holdings.map((h) => ({
    instrumentId: h.instrumentId,
    marketValue: h.marketValue,
    sector: h.sector,
    country: h.country,
    market: h.market,
  }));
  const bySector = computeAllocation(allocatable, "sector");
  const byCountry = computeAllocation(allocatable, "country");
  const byMarket = computeAllocation(allocatable, "market");

  // The "Unknown" sector bucket stays IN the HHI math on purpose — it is a
  // real share of the portfolio whose sector concentration we genuinely
  // don't know, and leaving it out would understate concentration risk.
  const sectorHHI = computeHHI(bySector.slices.map((s) => s.sharePercent));

  const valueByCurrency = new Map<Currency, number>();
  for (const h of holdings) {
    valueByCurrency.set(h.currency, (valueByCurrency.get(h.currency) ?? 0) + h.marketValue);
  }
  const byCurrency = [...valueByCurrency.entries()]
    .map(([currency, value]) => ({
      currency,
      percent: holdingsValue > 0 ? (value / holdingsValue) * 100 : 0,
    }))
    .sort((a, b) => b.percent - a.percent);
  const nonBasePercent = byCurrency
    .filter((c) => c.currency !== baseCurrency)
    .reduce((sum, c) => sum + c.percent, 0);

  const payingHoldingCount = holdings.filter((h) =>
    dividendPayingInstrumentIds.has(h.instrumentId),
  ).length;

  return {
    baseCurrency,
    totalValue,
    holdingsValue,
    cashValue,
    cashPercent,
    holdingCount,
    holdings: holdingRows,
    allocation: { bySector: bySector.slices, byCountry: byCountry.slices, byMarket: byMarket.slices },
    concentration: { topHolding, sectorHHI, bySector: bySector.slices },
    fxExposure: { baseCurrency, nonBasePercent, byCurrency },
    dividends: {
      trailingIncome: trailingDividendIncome,
      yieldOnHoldingsPercent: holdingsValue > 0 ? (trailingDividendIncome / holdingsValue) * 100 : null,
      payingHoldingCount,
      payingHoldingPercent: holdingCount > 0 ? (payingHoldingCount / holdingCount) * 100 : null,
    },
  };
}

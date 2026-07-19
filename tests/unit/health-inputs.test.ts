import { describe, expect, it } from "vitest";
import {
  buildHealthScoreInput,
  computeHHI,
  type HealthScoreHolding,
} from "@/lib/portfolio/health-inputs";

function holding(overrides: Partial<HealthScoreHolding> & Pick<HealthScoreHolding, "instrumentId" | "marketValue">): HealthScoreHolding {
  return {
    ticker: overrides.instrumentId.toUpperCase(),
    name: overrides.instrumentId,
    sector: null,
    country: null,
    market: "US",
    currency: "USD",
    ...overrides,
  };
}

describe("computeHHI", () => {
  it("scores a single 100% share as maximally concentrated (10,000)", () => {
    expect(computeHHI([100])).toBe(10_000);
  });

  it("scores four equal 25% shares at 2,500", () => {
    expect(computeHHI([25, 25, 25, 25])).toBe(2500);
  });

  it("scores a 50/50 split at 5,000", () => {
    expect(computeHHI([50, 50])).toBe(5000);
  });

  it("scores a more diversified ten-way equal split lower than a concentrated one", () => {
    const tenWay = computeHHI(Array(10).fill(10));
    const twoWay = computeHHI([50, 50]);
    expect(tenWay).toBe(1000);
    expect(tenWay).toBeLessThan(twoWay);
  });

  it("returns 0 for an empty distribution", () => {
    expect(computeHHI([])).toBe(0);
  });
});

describe("buildHealthScoreInput", () => {
  it("computes cash percent and total value from holdings + cash", () => {
    const input = buildHealthScoreInput({
      baseCurrency: "OMR",
      holdingsValue: 800,
      cashValue: 200,
      holdings: [holding({ instrumentId: "aapl", marketValue: 800, currency: "OMR" })],
      dividendPayingInstrumentIds: new Set(),
      trailingDividendIncome: 0,
    });
    expect(input.totalValue).toBe(1000);
    expect(input.cashPercent).toBeCloseTo(20);
  });

  it("reports 0% cash for an all-zero portfolio without NaN", () => {
    const input = buildHealthScoreInput({
      baseCurrency: "OMR",
      holdingsValue: 0,
      cashValue: 0,
      holdings: [],
      dividendPayingInstrumentIds: new Set(),
      trailingDividendIncome: 0,
    });
    expect(input.cashPercent).toBe(0);
    expect(Number.isNaN(input.cashPercent)).toBe(false);
    expect(input.concentration.topHolding).toBeNull();
    expect(input.dividends.yieldOnHoldingsPercent).toBeNull();
    expect(input.dividends.payingHoldingPercent).toBeNull();
  });

  it("identifies the largest position as the top holding, by share of holdings value", () => {
    const input = buildHealthScoreInput({
      baseCurrency: "OMR",
      holdingsValue: 1000,
      cashValue: 0,
      holdings: [
        holding({ instrumentId: "aapl", marketValue: 600, currency: "OMR" }),
        holding({ instrumentId: "msft", marketValue: 400, currency: "OMR" }),
      ],
      dividendPayingInstrumentIds: new Set(),
      trailingDividendIncome: 0,
    });
    expect(input.concentration.topHolding).toEqual({ ticker: "AAPL", percentOfHoldings: 60 });
    expect(input.holdings[0].ticker).toBe("AAPL");
    expect(input.holdings[0].percentOfHoldings).toBeCloseTo(60);
  });

  it("computes sector HHI over the sector allocation shares (equal split across 4 sectors)", () => {
    const input = buildHealthScoreInput({
      baseCurrency: "OMR",
      holdingsValue: 400,
      cashValue: 0,
      holdings: [
        holding({ instrumentId: "a", marketValue: 100, sector: "Technology", currency: "OMR" }),
        holding({ instrumentId: "b", marketValue: 100, sector: "Banks", currency: "OMR" }),
        holding({ instrumentId: "c", marketValue: 100, sector: "Energy", currency: "OMR" }),
        holding({ instrumentId: "d", marketValue: 100, sector: "Healthcare", currency: "OMR" }),
      ],
      dividendPayingInstrumentIds: new Set(),
      trailingDividendIncome: 0,
    });
    expect(input.concentration.sectorHHI).toBeCloseTo(2500);
  });

  it("scores a single-sector portfolio as maximally concentrated (10,000)", () => {
    const input = buildHealthScoreInput({
      baseCurrency: "OMR",
      holdingsValue: 500,
      cashValue: 0,
      holdings: [
        holding({ instrumentId: "a", marketValue: 300, sector: "Technology", currency: "OMR" }),
        holding({ instrumentId: "b", marketValue: 200, sector: "Technology", currency: "OMR" }),
      ],
      dividendPayingInstrumentIds: new Set(),
      trailingDividendIncome: 0,
    });
    expect(input.concentration.sectorHHI).toBeCloseTo(10_000);
  });

  it("sums allocation shares to ~100% (sector, country, market)", () => {
    const input = buildHealthScoreInput({
      baseCurrency: "OMR",
      holdingsValue: 900,
      cashValue: 0,
      holdings: [
        holding({ instrumentId: "a", marketValue: 400, sector: "Technology", country: "United States", currency: "USD" }),
        holding({ instrumentId: "b", marketValue: 300, sector: "Banks", country: "Oman", market: "MSX", currency: "OMR" }),
        holding({ instrumentId: "c", marketValue: 200, currency: "USD" }), // null sector/country -> Unknown
      ],
      dividendPayingInstrumentIds: new Set(),
      trailingDividendIncome: 0,
    });
    const sumShares = (slices: { sharePercent: number }[]) =>
      slices.reduce((sum, s) => sum + s.sharePercent, 0);
    expect(sumShares(input.allocation.bySector)).toBeCloseTo(100);
    expect(sumShares(input.allocation.byCountry)).toBeCloseTo(100);
    expect(sumShares(input.allocation.byMarket)).toBeCloseTo(100);
  });

  it("computes FX exposure as the share of holdings value NOT in the base currency", () => {
    const input = buildHealthScoreInput({
      baseCurrency: "OMR",
      holdingsValue: 1000,
      cashValue: 0,
      holdings: [
        holding({ instrumentId: "aapl", marketValue: 700, currency: "USD" }),
        holding({ instrumentId: "bkmb", marketValue: 300, currency: "OMR" }),
      ],
      dividendPayingInstrumentIds: new Set(),
      trailingDividendIncome: 0,
    });
    expect(input.fxExposure.nonBasePercent).toBeCloseTo(70);
    expect(input.fxExposure.byCurrency).toEqual(
      expect.arrayContaining([
        { currency: "USD", percent: 70 },
        { currency: "OMR", percent: 30 },
      ]),
    );
  });

  it("reports 0% FX exposure when every holding is already in the base currency", () => {
    const input = buildHealthScoreInput({
      baseCurrency: "OMR",
      holdingsValue: 500,
      cashValue: 0,
      holdings: [holding({ instrumentId: "bkmb", marketValue: 500, currency: "OMR" })],
      dividendPayingInstrumentIds: new Set(),
      trailingDividendIncome: 0,
    });
    expect(input.fxExposure.nonBasePercent).toBe(0);
  });

  it("computes dividend yield-on-holdings and the paying-holdings share", () => {
    const input = buildHealthScoreInput({
      baseCurrency: "OMR",
      holdingsValue: 1000,
      cashValue: 0,
      holdings: [
        holding({ instrumentId: "aapl", marketValue: 600, currency: "OMR" }),
        holding({ instrumentId: "msft", marketValue: 400, currency: "OMR" }),
      ],
      dividendPayingInstrumentIds: new Set(["aapl"]),
      trailingDividendIncome: 25,
    });
    expect(input.dividends.trailingIncome).toBe(25);
    expect(input.dividends.yieldOnHoldingsPercent).toBeCloseTo(2.5);
    expect(input.dividends.payingHoldingCount).toBe(1);
    expect(input.dividends.payingHoldingPercent).toBeCloseTo(50);
  });
});

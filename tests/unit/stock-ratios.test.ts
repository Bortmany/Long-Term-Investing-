import { describe, expect, it } from "vitest";
import {
  computeChangePercent,
  computeCurrentRatio,
  computeDebtToEquity,
  computeDividendYield,
  computePriceToBook,
  computePriceToEarnings,
  computeReturnOnEquity,
  latestStatementRow,
  oneYearRange,
  sumTrailingDividendsPerShare,
} from "@/lib/stocks/ratios";

describe("computePriceToEarnings", () => {
  it("divides price by diluted EPS", () => {
    const result = computePriceToEarnings(200, { epsdiluted: 8 });
    expect(result).toEqual({ ok: true, value: 25 });
  });

  it("falls back to eps when epsdiluted is missing", () => {
    const result = computePriceToEarnings(100, { eps: 4 });
    expect(result).toEqual({ ok: true, value: 25 });
  });

  it("is unavailable for negative earnings — never a fake P/E", () => {
    expect(computePriceToEarnings(100, { eps: -2 })).toEqual({ ok: false });
  });

  it("is unavailable when the price is missing", () => {
    expect(computePriceToEarnings(null, { eps: 4 })).toEqual({ ok: false });
  });

  it("is unavailable when the income statement is missing", () => {
    expect(computePriceToEarnings(100, undefined)).toEqual({ ok: false });
  });
});

describe("computePriceToBook", () => {
  it("divides price by book value per share (equity ÷ shares)", () => {
    const result = computePriceToBook(
      50,
      { weightedAverageShsOut: 1_000_000 },
      { totalStockholdersEquity: 20_000_000 },
    );
    // book value per share = 20 -> P/B = 50 / 20 = 2.5
    expect(result).toEqual({ ok: true, value: 2.5 });
  });

  it("is unavailable when shares outstanding is missing", () => {
    const result = computePriceToBook(50, {}, { totalStockholdersEquity: 20_000_000 });
    expect(result).toEqual({ ok: false });
  });

  it("is unavailable when equity is missing", () => {
    const result = computePriceToBook(50, { weightedAverageShsOut: 1_000_000 }, {});
    expect(result).toEqual({ ok: false });
  });
});

describe("computeDividendYield", () => {
  it("divides trailing dividends per share by price, as a percentage", () => {
    expect(computeDividendYield(100, 3)).toEqual({ ok: true, value: 3 });
  });

  it("is unavailable when there's no trailing dividend data", () => {
    expect(computeDividendYield(100, null)).toEqual({ ok: false });
  });

  it("is unavailable when the price is zero or missing", () => {
    expect(computeDividendYield(0, 3)).toEqual({ ok: false });
    expect(computeDividendYield(null, 3)).toEqual({ ok: false });
  });
});

describe("computeDebtToEquity", () => {
  it("divides total liabilities by equity", () => {
    const result = computeDebtToEquity({ totalLiabilities: 400, totalStockholdersEquity: 200 });
    expect(result).toEqual({ ok: true, value: 2 });
  });

  it("is unavailable when equity is zero (division by zero)", () => {
    expect(
      computeDebtToEquity({ totalLiabilities: 400, totalStockholdersEquity: 0 }),
    ).toEqual({ ok: false });
  });

  it("is unavailable when the balance sheet is missing", () => {
    expect(computeDebtToEquity(undefined)).toEqual({ ok: false });
  });
});

describe("computeReturnOnEquity", () => {
  it("divides net income by equity, as a percentage", () => {
    const result = computeReturnOnEquity(
      { netIncome: 50 },
      { totalStockholdersEquity: 500 },
    );
    expect(result).toEqual({ ok: true, value: 10 });
  });

  it("is unavailable when net income is missing", () => {
    expect(computeReturnOnEquity({}, { totalStockholdersEquity: 500 })).toEqual({ ok: false });
  });
});

describe("computeCurrentRatio", () => {
  it("divides current assets by current liabilities", () => {
    const result = computeCurrentRatio({
      totalCurrentAssets: 300,
      totalCurrentLiabilities: 150,
    });
    expect(result).toEqual({ ok: true, value: 2 });
  });

  it("is unavailable when current liabilities are zero", () => {
    expect(
      computeCurrentRatio({ totalCurrentAssets: 300, totalCurrentLiabilities: 0 }),
    ).toEqual({ ok: false });
  });
});

describe("computeChangePercent", () => {
  it("computes the percent change between the two most recent points, regardless of input order", () => {
    const points = [
      { date: new Date("2026-07-10"), close: 220 },
      { date: new Date("2026-01-05"), close: 200 },
    ];
    // Unsorted input (most recent first) — the function must sort internally.
    const result = computeChangePercent(points);
    expect(result).toEqual({ ok: true, value: 10 });
  });

  it("is unavailable with fewer than two points — never a fabricated 0%", () => {
    expect(computeChangePercent([])).toEqual({ ok: false });
    expect(computeChangePercent([{ date: new Date(), close: 100 }])).toEqual({ ok: false });
  });

  it("is unavailable when the previous point is non-positive", () => {
    const points = [
      { date: new Date("2026-01-01"), close: 0 },
      { date: new Date("2026-01-02"), close: 10 },
    ];
    expect(computeChangePercent(points)).toEqual({ ok: false });
  });
});

describe("sumTrailingDividendsPerShare", () => {
  const now = new Date("2026-07-19T00:00:00Z");

  it("sums payments within the trailing 12 months", () => {
    const payments = [
      { exDate: new Date("2026-05-01"), amountPerShare: 1 },
      { exDate: new Date("2026-02-01"), amountPerShare: 1.5 },
      { exDate: new Date("2024-01-01"), amountPerShare: 100 }, // too old — excluded
    ];
    expect(sumTrailingDividendsPerShare(payments, now)).toBeCloseTo(2.5);
  });

  it("returns null when there are no payments in the window", () => {
    const payments = [{ exDate: new Date("2020-01-01"), amountPerShare: 5 }];
    expect(sumTrailingDividendsPerShare(payments, now)).toBeNull();
  });
});

describe("latestStatementRow", () => {
  it("picks the row with the most recent date field", () => {
    const rows = [{ date: "2023-12-31", netIncome: 1 }, { date: "2025-12-31", netIncome: 3 }, { date: "2024-12-31", netIncome: 2 }];
    expect(latestStatementRow(rows)).toEqual({ date: "2025-12-31", netIncome: 3 });
  });

  it("returns undefined for an empty or missing row list", () => {
    expect(latestStatementRow([])).toBeUndefined();
    expect(latestStatementRow(undefined)).toBeUndefined();
  });
});

describe("oneYearRange", () => {
  it("spans exactly 365 days ending at `now`", () => {
    const now = new Date("2026-07-19T00:00:00Z");
    const { from, to } = oneYearRange(now);
    expect(to).toEqual(now);
    expect(to.getTime() - from.getTime()).toBe(365 * 24 * 60 * 60 * 1000);
  });
});

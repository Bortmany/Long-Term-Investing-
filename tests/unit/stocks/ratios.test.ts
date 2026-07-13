import { describe, expect, it } from "vitest";

import {
  currentRatio,
  debtToEquity,
  deriveRatios,
  dividendYield,
  priceToBook,
  priceToEarnings,
  returnOnEquity,
  type RatioInputs,
} from "@/lib/stocks/ratios";

// Each ratio is tested with a normal case AND a missing-input / meaningless
// case, proving every ratio fails independently (golden rule: a null tile,
// never a fabricated number).

describe("priceToEarnings", () => {
  it("computes P/E for a normal case", () => {
    expect(priceToEarnings(150, 6)).toBe(25);
  });

  it("is null on non-positive (meaningless) earnings", () => {
    // Negative earnings make a P/E meaningless — never shown as a number.
    expect(priceToEarnings(150, -6)).toBeNull();
    expect(priceToEarnings(150, 0)).toBeNull();
  });

  it("is null when the price is missing", () => {
    expect(priceToEarnings(null, 6)).toBeNull();
    expect(priceToEarnings(undefined, 6)).toBeNull();
  });
});

describe("priceToBook", () => {
  it("computes P/B for a normal case", () => {
    expect(priceToBook(30, 12)).toBe(2.5);
  });

  it("is null when book value per share is missing or non-positive", () => {
    expect(priceToBook(30, null)).toBeNull();
    expect(priceToBook(30, 0)).toBeNull();
    expect(priceToBook(30, -4)).toBeNull();
  });
});

describe("dividendYield", () => {
  it("computes the yield as a percentage for a normal case", () => {
    expect(dividendYield(2, 50)).toBe(4);
  });

  it("treats a genuine zero dividend as 0%, not unavailable", () => {
    expect(dividendYield(0, 50)).toBe(0);
  });

  it("is null when the dividend per share is unknown or the price is missing", () => {
    expect(dividendYield(null, 50)).toBeNull();
    expect(dividendYield(2, null)).toBeNull();
    expect(dividendYield(2, 0)).toBeNull();
  });
});

describe("debtToEquity", () => {
  it("computes debt/equity for a normal case", () => {
    expect(debtToEquity(400, 800)).toBe(0.5);
  });

  it("is null when equity is missing or non-positive", () => {
    expect(debtToEquity(400, 0)).toBeNull();
    expect(debtToEquity(400, -100)).toBeNull();
    expect(debtToEquity(400, undefined)).toBeNull();
  });
});

describe("returnOnEquity", () => {
  it("computes ROE as a percentage for a normal case", () => {
    expect(returnOnEquity(150, 1000)).toBe(15);
  });

  it("keeps a meaningful negative ROE (loss over positive equity)", () => {
    expect(returnOnEquity(-200, 1000)).toBe(-20);
  });

  it("is null when net income is missing or equity is non-positive", () => {
    expect(returnOnEquity(null, 1000)).toBeNull();
    expect(returnOnEquity(150, 0)).toBeNull();
    expect(returnOnEquity(150, -500)).toBeNull();
  });
});

describe("currentRatio", () => {
  it("computes the current ratio for a normal case", () => {
    expect(currentRatio(600, 300)).toBe(2);
  });

  it("is null when current liabilities are missing or non-positive", () => {
    expect(currentRatio(600, 0)).toBeNull();
    expect(currentRatio(600, null)).toBeNull();
    expect(currentRatio(null, 300)).toBeNull();
  });
});

describe("deriveRatios", () => {
  const fullInputs: RatioInputs = {
    price: 150,
    earningsPerShare: 6,
    bookValuePerShare: 30,
    dividendPerShare: 3,
    totalDebt: 400,
    totalEquity: 800,
    netIncome: 120,
    currentAssets: 600,
    currentLiabilities: 300,
  };

  it("returns all six tiles in order, each with a computed value", () => {
    const tiles = deriveRatios(fullInputs);
    expect(tiles.map((t) => t.key)).toEqual([
      "pe",
      "pb",
      "dividend-yield",
      "debt-equity",
      "roe",
      "current-ratio",
    ]);
    expect(tiles.every((t) => t.value !== null)).toBe(true);
  });

  it("fails each ratio independently — one missing input never blanks the rest", () => {
    // Only the balance-sheet equity is missing: P/E, P/B, Dividend Yield and
    // Current Ratio still compute; Debt/Equity and ROE go null on their own.
    const tiles = deriveRatios({ ...fullInputs, totalEquity: null });
    const byKey = Object.fromEntries(tiles.map((t) => [t.key, t.value]));
    expect(byKey.pe).not.toBeNull();
    expect(byKey.pb).not.toBeNull();
    expect(byKey["dividend-yield"]).not.toBeNull();
    expect(byKey["current-ratio"]).not.toBeNull();
    expect(byKey["debt-equity"]).toBeNull();
    expect(byKey.roe).toBeNull();
  });

  it("flags Dividend Yield and ROE as percentages, the rest as plain ratios", () => {
    const percentByKey = Object.fromEntries(
      deriveRatios(fullInputs).map((t) => [t.key, t.percent]),
    );
    expect(percentByKey["dividend-yield"]).toBe(true);
    expect(percentByKey.roe).toBe(true);
    expect(percentByKey.pe).toBe(false);
    expect(percentByKey.pb).toBe(false);
    expect(percentByKey["debt-equity"]).toBe(false);
    expect(percentByKey["current-ratio"]).toBe(false);
  });
});

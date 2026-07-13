import { describe, expect, it } from "vitest";
import { computeReturns } from "@/lib/portfolio/returns";
import type { FxRateInput, TxnInput } from "@/lib/portfolio/types";

const d = (s: string) => new Date(s);

const txn = (partial: Partial<TxnInput> & Pick<TxnInput, "type" | "amount">): TxnInput => ({
  instrumentId: null,
  quantity: null,
  pricePerUnit: null,
  currency: "OMR",
  fee: 0,
  tradeDate: d("2026-01-15"),
  ...partial,
});

const fxRates: FxRateInput[] = [
  { base: "USD", quote: "OMR", rate: 0.385, asOf: d("2026-07-01") },
];

describe("computeReturns", () => {
  it("computes both variants against net contributions", () => {
    const transactions: TxnInput[] = [
      txn({ type: "DEPOSIT", amount: 1000 }),
      txn({ type: "WITHDRAWAL", amount: 200 }),
      txn({ type: "DIVIDEND", amount: 50, instrumentId: "inst" }),
      // Buys/sells/fees do not enter the formula directly:
      txn({ type: "BUY", amount: 500, instrumentId: "inst", quantity: 10, pricePerUnit: 50 }),
    ];

    const returns = computeReturns({
      transactions,
      currentValue: 900,
      baseCurrency: "OMR",
      fxRates,
    });

    expect(returns.netContributions).toBe(800); // 1000 − 200
    expect(returns.dividends).toBe(50);
    // with dividends: 900 + 50 − 800 = 150 → 18.75% of 800
    expect(returns.withDividends.absolute).toBeCloseTo(150);
    expect(returns.withDividends.percent).toBeCloseTo(18.75);
    // without dividends: 900 − 800 = 100 → 12.5%
    expect(returns.withoutDividends.absolute).toBeCloseTo(100);
    expect(returns.withoutDividends.percent).toBeCloseTo(12.5);
    expect(returns.complete).toBe(true);
  });

  it("converts contributions and dividends to the base currency", () => {
    const transactions: TxnInput[] = [
      txn({ type: "DEPOSIT", amount: 1000, currency: "USD" }),
      txn({ type: "DIVIDEND", amount: 100, currency: "USD", fee: 10, instrumentId: "i" }),
    ];
    const returns = computeReturns({
      transactions,
      currentValue: 500,
      baseCurrency: "OMR",
      fxRates,
    });
    expect(returns.netContributions).toBeCloseTo(385); // 1000 USD → OMR
    expect(returns.dividends).toBeCloseTo(34.65); // (100 − 10) USD → OMR
  });

  it("returns typed zeros for an empty portfolio (never NaN)", () => {
    const returns = computeReturns({
      transactions: [],
      currentValue: 0,
      baseCurrency: "OMR",
      fxRates: [],
    });
    expect(returns.withDividends).toEqual({ absolute: 0, percent: 0 });
    expect(returns.withoutDividends).toEqual({ absolute: 0, percent: 0 });
    expect(Number.isNaN(returns.withDividends.percent)).toBe(false);
    expect(returns.complete).toBe(true);
  });

  it("guards the percent against zero net contributions", () => {
    // Value appeared without any recorded deposit (e.g. only buys were
    // imported): the absolute return is real, but percent-of-nothing is 0.
    const returns = computeReturns({
      transactions: [txn({ type: "DIVIDEND", amount: 10, instrumentId: "i" })],
      currentValue: 100,
      baseCurrency: "OMR",
      fxRates: [],
    });
    expect(returns.netContributions).toBe(0);
    expect(returns.withDividends.absolute).toBeCloseTo(110);
    expect(returns.withDividends.percent).toBe(0);
    expect(Number.isNaN(returns.withoutDividends.percent)).toBe(false);
  });

  it("reports unconvertible amounts in missing instead of guessing a rate", () => {
    const transactions: TxnInput[] = [
      txn({ type: "DEPOSIT", amount: 1000 }),
      txn({ type: "DEPOSIT", amount: 500, currency: "SAR" }), // no SAR rate given
      txn({ type: "DIVIDEND", amount: 40, currency: "SAR", instrumentId: "i" }),
    ];
    const returns = computeReturns({
      transactions,
      currentValue: 1200,
      baseCurrency: "OMR",
      fxRates,
    });
    expect(returns.netContributions).toBe(1000); // the SAR deposit is NOT silently included
    expect(returns.dividends).toBe(0);
    expect(returns.complete).toBe(false);
    expect(returns.missing).toHaveLength(2);
    expect(returns.missing.map((m) => m.kind).sort()).toEqual([
      "contribution",
      "dividend",
    ]);
  });
});

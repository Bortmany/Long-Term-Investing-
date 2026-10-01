import { describe, expect, it } from "vitest";
import {
  computeDividendsByHolding,
  computeMonthlyDividends,
  computeTrailingDividendIncome,
  roundMoney,
} from "@/lib/portfolio/dividends";
import type { FxRateInput, TxnInput } from "@/lib/portfolio/types";

const d = (s: string) => new Date(s);

const dividend = (
  amount: number,
  currency: TxnInput["currency"],
  tradeDate: string,
  fee = 0,
): TxnInput => ({
  type: "DIVIDEND",
  instrumentId: "inst",
  quantity: null,
  pricePerUnit: null,
  amount,
  currency,
  fee,
  tradeDate: d(tradeDate),
});

const fxRates: FxRateInput[] = [
  { base: "USD", quote: "OMR", rate: 0.385, asOf: d("2026-07-01") },
];

describe("computeTrailingDividendIncome", () => {
  const now = d("2026-07-12");

  it("sums dividends in the trailing 12 months, converted to base currency", () => {
    const txns: TxnInput[] = [
      dividend(100, "USD", "2026-06-01"),
      dividend(50, "OMR", "2026-01-15"),
      // Outside the window — must be excluded:
      dividend(999, "USD", "2025-05-01"),
      // Non-dividend rows must be ignored:
      {
        type: "DEPOSIT",
        instrumentId: null,
        quantity: null,
        pricePerUnit: null,
        amount: 1000,
        currency: "OMR",
        fee: 0,
        tradeDate: d("2026-03-01"),
      },
    ];

    const income = computeTrailingDividendIncome(txns, {
      baseCurrency: "OMR",
      fxRates,
      now,
    });

    expect(income.total).toBeCloseTo(100 * 0.385 + 50, 8);
    expect(income.count).toBe(2);
    expect(income.complete).toBe(true);
    expect(income.baseCurrency).toBe("OMR");
  });

  it("subtracts withholding fees from dividend amounts", () => {
    const income = computeTrailingDividendIncome(
      [dividend(100, "OMR", "2026-06-01", 10)],
      { baseCurrency: "OMR", fxRates, now },
    );
    expect(income.total).toBeCloseTo(90, 8);
  });

  it("lists unconvertible dividends in missing instead of inventing a rate", () => {
    const income = computeTrailingDividendIncome(
      [dividend(100, "SAR", "2026-06-01"), dividend(10, "OMR", "2026-05-01")],
      { baseCurrency: "OMR", fxRates, now },
    );
    expect(income.total).toBeCloseTo(10, 8);
    expect(income.complete).toBe(false);
    expect(income.missing).toEqual([
      { currency: "SAR", amount: 100, tradeDate: d("2026-06-01"), instrumentId: "inst" },
    ]);
  });

  it("respects a custom window length", () => {
    const income = computeTrailingDividendIncome(
      [dividend(100, "OMR", "2026-02-01"), dividend(40, "OMR", "2026-07-01")],
      { baseCurrency: "OMR", fxRates, now, months: 3 },
    );
    expect(income.total).toBeCloseTo(40, 8);
    expect(income.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Step 3: unconvertible dividends and the "headline = sum of rows" rule.
// ---------------------------------------------------------------------------
const dividendFor = (
  instrumentId: string,
  amount: number,
  currency: TxnInput["currency"],
  tradeDate: string,
): TxnInput => ({ ...dividend(amount, currency, tradeDate), instrumentId });

describe("unconvertible dividends", () => {
  const now = d("2026-07-12");
  const opts = { baseCurrency: "OMR" as const, fxRates, now };

  it("lands in missing and stays out of the total, in all three figures", () => {
    const txns = [
      dividendFor("armco", 100, "SAR", "2026-06-01"),
      dividendFor("bkmb", 10, "OMR", "2026-05-01"),
    ];
    const income = computeTrailingDividendIncome(txns, opts);
    const monthly = computeMonthlyDividends(txns, opts);
    const byHolding = computeDividendsByHolding(txns, opts);

    expect(income.total).toBe(10);
    expect(income.complete).toBe(false);
    expect(income.missing.map((m) => m.instrumentId)).toEqual(["armco"]);

    expect(monthly.complete).toBe(false);
    expect(monthly.buckets.reduce((sum, b) => sum + b.total, 0)).toBe(10);
    expect(monthly.missing.map((m) => m.instrumentId)).toEqual(["armco"]);

    expect(byHolding.complete).toBe(false);
    expect(byHolding.rows.map((r) => r.instrumentId)).toEqual(["bkmb"]);
    expect(byHolding.missing.map((m) => m.instrumentId)).toEqual(["armco"]);
  });

  it("a dividend that can be converted through the rial is included, not missing", () => {
    const rates: FxRateInput[] = [
      { base: "SAR", quote: "OMR", rate: 0.1, asOf: d("2026-07-01") },
      { base: "USD", quote: "OMR", rate: 0.4, asOf: d("2026-07-02") },
    ];
    const income = computeTrailingDividendIncome(
      [dividendFor("armco", 100, "SAR", "2026-06-01")],
      { baseCurrency: "USD", fxRates: rates, now },
    );
    expect(income.complete).toBe(true);
    expect(income.missing).toEqual([]);
    expect(income.total).toBe(25);
  });
});

describe("dividend headline equals the sum of the rounded rows", () => {
  const now = d("2026-07-12");

  it("fixes the 0.001 drift: two holdings of 100.0004 OMR", () => {
    // Unrounded: 100.0004 + 100.0004 = 200.0008 → would show 200.001.
    // Rows on screen: 100.000 + 100.000 → the headline must say 200.000.
    const txns = [
      dividendFor("a", 100.0004, "OMR", "2026-06-01"),
      dividendFor("b", 100.0004, "OMR", "2026-06-02"),
    ];
    const opts = { baseCurrency: "OMR" as const, fxRates: [], now };
    const income = computeTrailingDividendIncome(txns, opts);
    const byHolding = computeDividendsByHolding(txns, opts);

    const rowSum = roundMoney(byHolding.rows.reduce((s, r) => s + r.total, 0), "OMR");
    expect(byHolding.rows.map((r) => r.total)).toEqual([100, 100]);
    expect(income.total).toBe(200);
    expect(income.total).toBe(rowSum);
  });

  it("holds for converted amounts too (USD → OMR)", () => {
    const txns = [
      dividendFor("a", 318.4, "USD", "2026-06-01"),
      dividendFor("b", 318.4, "USD", "2026-06-02"),
      dividendFor("c", 12.3456, "USD", "2026-06-03"),
    ];
    const opts = { baseCurrency: "OMR" as const, fxRates, now };
    const income = computeTrailingDividendIncome(txns, opts);
    const byHolding = computeDividendsByHolding(txns, opts);
    const rowSum = roundMoney(byHolding.rows.reduce((s, r) => s + r.total, 0), "OMR");
    expect(income.total).toBe(rowSum);
  });

  it("rounds non-rial currencies to 2 decimals", () => {
    expect(roundMoney(10.005, "USD")).toBe(10.01);
    expect(roundMoney(1.0005, "OMR")).toBe(1.001);
    expect(roundMoney(1.00049, "OMR")).toBe(1);
  });
});

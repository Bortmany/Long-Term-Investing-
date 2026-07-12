import { describe, expect, it } from "vitest";
import { computeTrailingDividendIncome } from "@/lib/portfolio/dividends";
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
      { currency: "SAR", amount: 100, tradeDate: d("2026-06-01") },
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

import { describe, expect, it } from "vitest";
import {
  computeDividendsByHolding,
  computeMonthlyDividends,
} from "@/lib/portfolio/dividends";
import type { FxRateInput, TxnInput } from "@/lib/portfolio/types";

const d = (s: string) => new Date(s);

const dividend = (
  amount: number,
  tradeDate: string,
  overrides: Partial<TxnInput> = {},
): TxnInput => ({
  type: "DIVIDEND",
  instrumentId: "inst-a",
  quantity: null,
  pricePerUnit: null,
  amount,
  currency: "OMR",
  fee: 0,
  tradeDate: d(tradeDate),
  ...overrides,
});

const fxRates: FxRateInput[] = [
  { base: "USD", quote: "OMR", rate: 0.385, asOf: d("2026-07-01") },
];

describe("computeMonthlyDividends", () => {
  const now = d("2026-07-12");

  it("returns 12 calendar-month buckets, oldest first, ending in the current month", () => {
    const result = computeMonthlyDividends([], {
      baseCurrency: "OMR",
      fxRates,
      now,
    });
    expect(result.buckets).toHaveLength(12);
    expect(result.buckets[0]).toMatchObject({ year: 2025, month: 8, label: "Aug" });
    expect(result.buckets[11]).toMatchObject({ year: 2026, month: 7, label: "Jul" });
    // Empty months are real zeros:
    expect(result.buckets.every((b) => b.total === 0)).toBe(true);
  });

  it("sums converted dividends into the right month and skips ones outside the window", () => {
    const txns = [
      dividend(100, "2026-06-15", { currency: "USD" }), // 38.5 OMR → June
      dividend(20, "2026-06-01"), // 20 OMR → June
      dividend(999, "2025-07-30"), // before the window (first bucket is Aug 2025)
      { ...dividend(50, "2026-06-20"), type: "DEPOSIT" as const }, // not a dividend
    ];
    const result = computeMonthlyDividends(txns, {
      baseCurrency: "OMR",
      fxRates,
      now,
    });
    const june = result.buckets.find((b) => b.year === 2026 && b.month === 6);
    expect(june?.total).toBeCloseTo(58.5);
    expect(result.complete).toBe(true);
  });

  it("reports unconvertible dividends in missing, never in a bar", () => {
    const result = computeMonthlyDividends(
      [dividend(75, "2026-05-10", { currency: "SAR" })], // no SAR rate
      { baseCurrency: "OMR", fxRates, now },
    );
    const may = result.buckets.find((b) => b.year === 2026 && b.month === 5);
    expect(may?.total).toBe(0);
    expect(result.complete).toBe(false);
    expect(result.missing).toHaveLength(1);
  });
});

describe("computeDividendsByHolding", () => {
  const now = d("2026-07-12");

  it("totals per instrument, sorted top payer first", () => {
    const txns = [
      dividend(10, "2026-02-01", { instrumentId: "small" }),
      dividend(40, "2026-03-01", { instrumentId: "big" }),
      dividend(35, "2026-05-01", { instrumentId: "big" }),
    ];
    const result = computeDividendsByHolding(txns, {
      baseCurrency: "OMR",
      fxRates,
      now,
    });
    expect(result.rows).toEqual([
      { instrumentId: "big", total: 75, count: 2 },
      { instrumentId: "small", total: 10, count: 1 },
    ]);
  });
});

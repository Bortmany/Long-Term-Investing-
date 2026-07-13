import { describe, expect, it } from "vitest";

import { computeReviewDeltas, type ReviewSnapshot } from "@/lib/reviews/deltas";

describe("computeReviewDeltas", () => {
  it("returns null/0 deltas honestly when there is no previous review", () => {
    const current: ReviewSnapshot = {
      totalValue: 10000,
      allocation: [
        { category: "Technology", percent: 60 },
        { category: "Healthcare", percent: 40 },
      ],
    };

    const result = computeReviewDeltas(current, null);

    expect(result.totalValueDelta).toBeNull();
    expect(result.totalValuePercentDelta).toBeNull();
    expect(result.allocationDeltas).toEqual([
      { category: "Technology", previousPercent: null, currentPercent: 60, changePercent: null },
      { category: "Healthcare", previousPercent: null, currentPercent: 40, changePercent: null },
    ]);
  });

  it("treats a category present now but absent previously (and vice versa) as a real 0% on the missing side", () => {
    const current: ReviewSnapshot = {
      totalValue: 12000,
      allocation: [
        { category: "Technology", percent: 50 },
        { category: "Energy", percent: 10 }, // new position this week
      ],
    };
    const previous: ReviewSnapshot = {
      totalValue: 10000,
      allocation: [
        { category: "Technology", percent: 70 },
        { category: "Healthcare", percent: 30 }, // fully sold since then
      ],
    };

    const result = computeReviewDeltas(current, previous);

    const byCategory = Object.fromEntries(
      result.allocationDeltas.map((d) => [d.category, d]),
    );

    // Present both weeks — an ordinary delta.
    expect(byCategory.Technology).toEqual({
      category: "Technology",
      previousPercent: 70,
      currentPercent: 50,
      changePercent: -20,
    });

    // New this week: previously 0%, now 10% — no crash, honest 0 baseline.
    expect(byCategory.Energy).toEqual({
      category: "Energy",
      previousPercent: 0,
      currentPercent: 10,
      changePercent: 10,
    });

    // Fully exited: was 30%, now 0% — no crash, honest 0 current value.
    expect(byCategory.Healthcare).toEqual({
      category: "Healthcare",
      previousPercent: 30,
      currentPercent: 0,
      changePercent: -30,
    });

    // Total value delta is a real, computable number here.
    expect(result.totalValueDelta).toBe(2000);
    expect(result.totalValuePercentDelta).toBe(20);
  });

  it("never divides by zero when the previous total value was zero", () => {
    const current: ReviewSnapshot = {
      totalValue: 500,
      allocation: [{ category: "Technology", percent: 100 }],
    };
    const previous: ReviewSnapshot = {
      totalValue: 0,
      allocation: [],
    };

    const result = computeReviewDeltas(current, previous);

    // The absolute delta is still a real, honest number...
    expect(result.totalValueDelta).toBe(500);
    // ...but a percent change off a zero base is undefined — never Infinity/NaN.
    expect(result.totalValuePercentDelta).toBeNull();
    expect(Number.isFinite(result.totalValuePercentDelta as number)).toBe(false);
  });

  it("returns a null total value delta when either side's total value is unknown", () => {
    const current: ReviewSnapshot = { totalValue: 100, allocation: [] };
    const previous: ReviewSnapshot = { totalValue: null, allocation: [] };

    const result = computeReviewDeltas(current, previous);

    expect(result.totalValueDelta).toBeNull();
    expect(result.totalValuePercentDelta).toBeNull();
  });
});

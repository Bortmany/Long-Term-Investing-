import { describe, expect, it } from "vitest";

import { computeReviewDelta, type ReviewSnapshot } from "@/lib/reviews/delta";

function snapshot(overrides: Partial<ReviewSnapshot> = {}): ReviewSnapshot {
  return {
    baseCurrency: "OMR",
    totalValue: 10_000,
    holdingsValue: 9_000,
    cashValue: 1_000,
    holdings: [
      { instrumentId: "aapl", ticker: "AAPL", marketValue: 5_000 },
      { instrumentId: "msft", ticker: "MSFT", marketValue: 4_000 },
    ],
    sectorAllocation: [
      { label: "Technology", sharePercent: 100 },
    ],
    trailingDividendIncome: 200,
    ...overrides,
  };
}

describe("computeReviewDelta — first review", () => {
  it("honestly reports there is no prior week when previous is null", () => {
    const delta = computeReviewDelta(snapshot(), null);
    expect(delta).toEqual({ hasPrior: false });
  });
});

describe("computeReviewDelta — total value change", () => {
  it("computes signed absolute and percent change", () => {
    const previous = snapshot({ totalValue: 10_000 });
    const current = snapshot({ totalValue: 11_000 });
    const delta = computeReviewDelta(current, previous);
    expect(delta.hasPrior).toBe(true);
    if (delta.hasPrior) {
      expect(delta.totalValueChange).toEqual({ absolute: 1_000, percent: 10 });
    }
  });

  it("guards divide-by-zero when the previous total was 0", () => {
    const previous = snapshot({ totalValue: 0 });
    const current = snapshot({ totalValue: 500 });
    const delta = computeReviewDelta(current, previous);
    expect(delta.hasPrior).toBe(true);
    if (delta.hasPrior) {
      expect(delta.totalValueChange).toEqual({ absolute: 500, percent: null });
    }
  });
});

describe("computeReviewDelta — dividend income change", () => {
  it("computes the signed change in trailing dividend income", () => {
    const previous = snapshot({ trailingDividendIncome: 200 });
    const current = snapshot({ trailingDividendIncome: 250 });
    const delta = computeReviewDelta(current, previous);
    if (delta.hasPrior) {
      expect(delta.dividendIncomeChange).toBe(50);
    } else {
      throw new Error("expected hasPrior");
    }
  });
});

describe("computeReviewDelta — holdings", () => {
  it("detects a brand-new holding", () => {
    const previous = snapshot({
      holdings: [{ instrumentId: "aapl", ticker: "AAPL", marketValue: 5_000 }],
    });
    const current = snapshot({
      holdings: [
        { instrumentId: "aapl", ticker: "AAPL", marketValue: 5_000 },
        { instrumentId: "goog", ticker: "GOOG", marketValue: 2_000 },
      ],
    });
    const delta = computeReviewDelta(current, previous);
    if (!delta.hasPrior) throw new Error("expected hasPrior");
    expect(delta.newHoldings).toEqual([
      { instrumentId: "goog", ticker: "GOOG", currentValue: 2_000 },
    ]);
    expect(delta.droppedHoldings).toEqual([]);
  });

  it("detects a holding sold out of entirely", () => {
    const previous = snapshot({
      holdings: [
        { instrumentId: "aapl", ticker: "AAPL", marketValue: 5_000 },
        { instrumentId: "msft", ticker: "MSFT", marketValue: 4_000 },
      ],
    });
    const current = snapshot({
      holdings: [{ instrumentId: "aapl", ticker: "AAPL", marketValue: 5_000 }],
    });
    const delta = computeReviewDelta(current, previous);
    if (!delta.hasPrior) throw new Error("expected hasPrior");
    expect(delta.droppedHoldings).toEqual([
      { instrumentId: "msft", ticker: "MSFT", previousValue: 4_000 },
    ]);
  });

  it("computes a signed percent change for a holding present in both weeks", () => {
    const previous = snapshot({
      holdings: [{ instrumentId: "aapl", ticker: "AAPL", marketValue: 5_000 }],
    });
    const current = snapshot({
      holdings: [{ instrumentId: "aapl", ticker: "AAPL", marketValue: 5_500 }],
    });
    const delta = computeReviewDelta(current, previous);
    if (!delta.hasPrior) throw new Error("expected hasPrior");
    expect(delta.changedHoldings).toEqual([
      {
        instrumentId: "aapl",
        ticker: "AAPL",
        previousValue: 5_000,
        currentValue: 5_500,
        valueChangePercent: 10,
      },
    ]);
  });

  it("guards divide-by-zero when a holding's previous value was 0", () => {
    const previous = snapshot({
      holdings: [{ instrumentId: "aapl", ticker: "AAPL", marketValue: 0 }],
    });
    const current = snapshot({
      holdings: [{ instrumentId: "aapl", ticker: "AAPL", marketValue: 500 }],
    });
    const delta = computeReviewDelta(current, previous);
    if (!delta.hasPrior) throw new Error("expected hasPrior");
    expect(delta.changedHoldings[0].valueChangePercent).toBeNull();
  });
});

describe("computeReviewDelta — sector allocation drift", () => {
  it("computes drift for a sector present both weeks", () => {
    const previous = snapshot({
      sectorAllocation: [{ label: "Technology", sharePercent: 40 }],
    });
    const current = snapshot({
      sectorAllocation: [{ label: "Technology", sharePercent: 45 }],
    });
    const delta = computeReviewDelta(current, previous);
    if (!delta.hasPrior) throw new Error("expected hasPrior");
    expect(delta.sectorAllocation).toEqual([
      { label: "Technology", previousPercent: 40, currentPercent: 45, driftPercent: 5 },
    ]);
  });

  it("marks a brand-new sector with a null previousPercent/driftPercent, never an invented zero baseline", () => {
    const previous = snapshot({ sectorAllocation: [{ label: "Technology", sharePercent: 100 }] });
    const current = snapshot({
      sectorAllocation: [
        { label: "Technology", sharePercent: 80 },
        { label: "Healthcare", sharePercent: 20 },
      ],
    });
    const delta = computeReviewDelta(current, previous);
    if (!delta.hasPrior) throw new Error("expected hasPrior");
    const healthcare = delta.sectorAllocation.find((s) => s.label === "Healthcare");
    expect(healthcare).toEqual({
      label: "Healthcare",
      previousPercent: null,
      currentPercent: 20,
      driftPercent: null,
    });
  });

  it("surfaces a sector that disappeared entirely as a full drift to zero", () => {
    const previous = snapshot({
      sectorAllocation: [
        { label: "Technology", sharePercent: 70 },
        { label: "Energy", sharePercent: 30 },
      ],
    });
    const current = snapshot({ sectorAllocation: [{ label: "Technology", sharePercent: 100 }] });
    const delta = computeReviewDelta(current, previous);
    if (!delta.hasPrior) throw new Error("expected hasPrior");
    const energy = delta.sectorAllocation.find((s) => s.label === "Energy");
    expect(energy).toEqual({
      label: "Energy",
      previousPercent: 30,
      currentPercent: 0,
      driftPercent: -30,
    });
  });
});

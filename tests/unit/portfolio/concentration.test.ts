import { describe, it, expect } from "vitest";

import {
  computeConcentration,
  computeHhi,
  computeSectorHhi,
  computeTopHoldingWeight,
  type ConcentrationHolding,
} from "@/lib/portfolio/concentration";

// The HHI scale under test is the [0,1] fractional scale (share = value/total,
// HHI = Σ share²): single holding → 1, N equal holdings → 1/N. See the header
// comment in concentration.ts.

describe("computeHhi", () => {
  it("returns the maximum (1) for a single fully-concentrated holding", () => {
    expect(computeHhi([1000])).toBe(1);
  });

  it("returns 1/N for N evenly-split holdings", () => {
    // Two equal holdings → each share 0.5 → 0.25 + 0.25 = 0.5 = 1/2.
    expect(computeHhi([500, 500])).toBeCloseTo(0.5, 12);
    // Four equal holdings → 1/4.
    expect(computeHhi([25, 25, 25, 25])).toBeCloseTo(0.25, 12);
    // Ten equal holdings → 1/10, independent of the absolute values.
    expect(computeHhi([7, 7, 7, 7, 7, 7, 7, 7, 7, 7])).toBeCloseTo(0.1, 12);
  });

  it("returns a hand-computed value for a mixed real-ish portfolio", () => {
    // Values 60, 30, 10 out of 100 → shares 0.6, 0.3, 0.1.
    // HHI = 0.36 + 0.09 + 0.01 = 0.46.
    expect(computeHhi([60, 30, 10])).toBeCloseTo(0.46, 12);
  });

  it("is invariant to scale (values vs. the same shares)", () => {
    // Multiplying every value by a constant leaves the shares — and so the
    // HHI — unchanged.
    expect(computeHhi([600, 300, 100])).toBeCloseTo(computeHhi([60, 30, 10])!, 12);
  });

  it("returns null for an empty portfolio (not a fabricated 0)", () => {
    expect(computeHhi([])).toBeNull();
  });

  it("returns null when the total value is zero", () => {
    expect(computeHhi([0, 0, 0])).toBeNull();
  });

  it("always lands in (0, 1] for real holdings", () => {
    const hhi = computeHhi([120, 45, 33, 9, 1]);
    expect(hhi).not.toBeNull();
    expect(hhi!).toBeGreaterThan(0);
    expect(hhi!).toBeLessThanOrEqual(1);
  });
});

describe("computeTopHoldingWeight", () => {
  it("is 1 for a single holding", () => {
    expect(computeTopHoldingWeight([42])).toBe(1);
  });

  it("is the largest position's share of the total", () => {
    // Largest is 60 of 100 → 0.6.
    expect(computeTopHoldingWeight([60, 30, 10])).toBeCloseTo(0.6, 12);
    // Order does not matter.
    expect(computeTopHoldingWeight([10, 60, 30])).toBeCloseTo(0.6, 12);
  });

  it("is 1/N when all holdings are equal", () => {
    expect(computeTopHoldingWeight([5, 5, 5, 5])).toBeCloseTo(0.25, 12);
  });

  it("returns null for an empty portfolio and for a zero total", () => {
    expect(computeTopHoldingWeight([])).toBeNull();
    expect(computeTopHoldingWeight([0, 0])).toBeNull();
  });
});

describe("computeSectorHhi", () => {
  it("sums holdings into sector buckets before taking the HHI", () => {
    // Tech 70 (40 + 30), Energy 30 → shares 0.7 / 0.3 → 0.49 + 0.09 = 0.58.
    const holdings: ConcentrationHolding[] = [
      { value: 40, sector: "Technology" },
      { value: 30, sector: "Technology" },
      { value: 30, sector: "Energy" },
    ];
    expect(computeSectorHhi(holdings)).toBeCloseTo(0.58, 12);
  });

  it("buckets null-sector holdings together as 'Unknown'", () => {
    // Two null-sector holdings collapse into one Unknown bucket of 50, vs a
    // Tech bucket of 50 → shares 0.5 / 0.5 → HHI 0.5. (If null sectors were
    // instead treated as distinct buckets the HHI would be lower.)
    const holdings: ConcentrationHolding[] = [
      { value: 50, sector: "Technology" },
      { value: 25, sector: null },
      { value: 25, sector: null },
    ];
    expect(computeSectorHhi(holdings)).toBeCloseTo(0.5, 12);
  });

  it("treats an all-null-sector portfolio as one fully-concentrated Unknown bucket", () => {
    const holdings: ConcentrationHolding[] = [
      { value: 10, sector: null },
      { value: 20, sector: null },
    ];
    expect(computeSectorHhi(holdings)).toBe(1);
  });

  it("returns null for an empty portfolio", () => {
    expect(computeSectorHhi([])).toBeNull();
  });

  it("returns null when every bucket totals zero", () => {
    expect(
      computeSectorHhi([
        { value: 0, sector: "Technology" },
        { value: 0, sector: null },
      ]),
    ).toBeNull();
  });
});

describe("computeConcentration", () => {
  it("reports every figure for a mixed portfolio", () => {
    const holdings: ConcentrationHolding[] = [
      { value: 60, sector: "Technology" },
      { value: 30, sector: "Technology" },
      { value: 10, sector: "Energy" },
    ];
    const metrics = computeConcentration(holdings);
    expect(metrics.holdingCount).toBe(3);
    // Position HHI over 60/30/10 → 0.46.
    expect(metrics.hhi).toBeCloseTo(0.46, 12);
    // Largest position 60/100 → 0.6.
    expect(metrics.topHoldingWeight).toBeCloseTo(0.6, 12);
    // Sector buckets Tech 90 / Energy 10 → shares 0.9 / 0.1 → 0.82.
    expect(metrics.sectorHhi).toBeCloseTo(0.82, 12);
  });

  it("returns nulls (not fabricated zeros) for an empty portfolio", () => {
    const metrics = computeConcentration([]);
    expect(metrics).toEqual({
      holdingCount: 0,
      hhi: null,
      topHoldingWeight: null,
      sectorHhi: null,
    });
  });
});

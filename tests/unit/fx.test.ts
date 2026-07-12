import { describe, expect, it } from "vitest";
import { convertAmount } from "@/lib/portfolio/fx";
import type { FxRateInput } from "@/lib/portfolio/types";

const rates: FxRateInput[] = [
  { base: "USD", quote: "OMR", rate: 0.385, asOf: new Date("2026-07-01") },
  { base: "SAR", quote: "OMR", rate: 0.1027, asOf: new Date("2026-07-01") },
];

describe("convertAmount", () => {
  it("returns the amount unchanged for same-currency conversion", () => {
    const result = convertAmount(100, "OMR", "OMR", []);
    expect(result).toEqual({ ok: true, value: 100, rate: 1, rateAsOf: null });
  });

  it("converts using a direct rate", () => {
    const result = convertAmount(1000, "USD", "OMR", rates);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeCloseTo(385, 8);
      expect(result.rate).toBe(0.385);
      expect(result.rateAsOf).toEqual(new Date("2026-07-01"));
    }
  });

  it("converts using the inverse of a stored rate", () => {
    const result = convertAmount(385, "OMR", "USD", rates);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeCloseTo(1000, 6);
    }
  });

  it("uses the most recent rate when several exist", () => {
    const history: FxRateInput[] = [
      { base: "USD", quote: "OMR", rate: 0.383, asOf: new Date("2026-01-01") },
      { base: "USD", quote: "OMR", rate: 0.385, asOf: new Date("2026-07-01") },
      { base: "USD", quote: "OMR", rate: 0.384, asOf: new Date("2026-04-01") },
    ];
    const result = convertAmount(100, "USD", "OMR", history);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rate).toBe(0.385);
    }
  });

  it("returns a typed missing-rate result instead of a silent 1.0", () => {
    const result = convertAmount(100, "AED", "OMR", rates);
    expect(result).toEqual({
      ok: false,
      missingRate: { from: "AED", to: "OMR" },
    });
  });
});

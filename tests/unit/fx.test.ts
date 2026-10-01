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

// ---------------------------------------------------------------------------
// Step 3: rates worked out through the rial (OMR), and bad stored rates.
// The numbers below are made-up test values, not real exchange rates.
// ---------------------------------------------------------------------------
describe("convertAmount through the rial", () => {
  const sarOmr: FxRateInput = { base: "SAR", quote: "OMR", rate: 0.1, asOf: new Date("2026-07-01") };
  const usdOmr: FxRateInput = { base: "USD", quote: "OMR", rate: 0.4, asOf: new Date("2026-07-05") };
  const qarOmr: FxRateInput = { base: "QAR", quote: "OMR", rate: 0.1, asOf: new Date("2026-07-03") };

  it("works out SAR→USD from a SAR/OMR row and a USD/OMR row", () => {
    const result = convertAmount(100, "SAR", "USD", [sarOmr, usdOmr]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 1 SAR = 0.1 OMR; 1 OMR = 1 / 0.4 USD  →  1 SAR = 0.25 USD
      expect(result.rate).toBeCloseTo(0.25, 10);
      expect(result.value).toBeCloseTo(25, 8);
    }
  });

  it("carries the OLDER leg's date and says it went via OMR, with both legs", () => {
    const result = convertAmount(100, "SAR", "USD", [sarOmr, usdOmr]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rateAsOf).toEqual(new Date("2026-07-01"));
      expect(result.viaHub?.via).toBe("OMR");
      expect(result.viaHub?.first).toMatchObject({ from: "SAR", to: "OMR", rate: 0.1 });
      expect(result.viaHub?.first.asOf).toEqual(new Date("2026-07-01"));
      expect(result.viaHub?.second).toMatchObject({ from: "OMR", to: "USD" });
      expect(result.viaHub?.second.rate).toBeCloseTo(2.5, 10);
      expect(result.viaHub?.second.asOf).toEqual(new Date("2026-07-05"));
    }
  });

  it("uses the older date whichever leg is older", () => {
    const newerSar = { ...sarOmr, asOf: new Date("2026-08-01") };
    const result = convertAmount(100, "SAR", "USD", [newerSar, usdOmr]);
    expect(result.ok && result.rateAsOf).toEqual(new Date("2026-07-05"));
  });

  it("gives a missing-rate result (never 1.0) when the USD/OMR leg is missing", () => {
    expect(convertAmount(100, "SAR", "USD", [sarOmr])).toEqual({
      ok: false,
      missingRate: { from: "SAR", to: "USD" },
    });
  });

  it("gives a missing-rate result (never 1.0) when the SAR/OMR leg is missing", () => {
    expect(convertAmount(100, "SAR", "USD", [usdOmr])).toEqual({
      ok: false,
      missingRate: { from: "SAR", to: "USD" },
    });
  });

  it("gives a missing-rate result when there are no rates at all", () => {
    expect(convertAmount(100, "SAR", "USD", [])).toEqual({
      ok: false,
      missingRate: { from: "SAR", to: "USD" },
    });
  });

  it("does not route through the rial when one end IS the rial", () => {
    // AED→OMR with only a USD row: no route, so honestly missing.
    expect(convertAmount(10, "AED", "OMR", [usdOmr]).ok).toBe(false);
  });

  it("USD→SAR is the inverse of SAR→USD within tolerance", () => {
    const rates = [sarOmr, usdOmr];
    const forward = convertAmount(1, "SAR", "USD", rates);
    const back = convertAmount(1, "USD", "SAR", rates);
    expect(forward.ok && back.ok).toBe(true);
    if (forward.ok && back.ok) {
      expect(forward.rate * back.rate).toBeCloseTo(1, 10);
      expect(back.rateAsOf).toEqual(new Date("2026-07-01"));
    }
  });

  it("converts QAR→OMR with a direct row", () => {
    const result = convertAmount(50, "QAR", "OMR", [qarOmr]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeCloseTo(5, 10);
      expect(result.viaHub).toBeUndefined();
    }
  });

  it("converts QAR→USD via OMR", () => {
    const result = convertAmount(100, "QAR", "USD", [qarOmr, usdOmr]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rate).toBeCloseTo(0.25, 10);
      expect(result.rateAsOf).toEqual(new Date("2026-07-03"));
      expect(result.viaHub?.via).toBe("OMR");
    }
  });

  it("a direct rate still wins over the derived route", () => {
    const direct: FxRateInput = { base: "SAR", quote: "USD", rate: 0.3, asOf: new Date("2026-01-01") };
    const result = convertAmount(100, "SAR", "USD", [sarOmr, usdOmr, direct]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rate).toBe(0.3);
      expect(result.rateAsOf).toEqual(new Date("2026-01-01"));
      expect(result.viaHub).toBeUndefined();
    }
  });

  it("an inverse row also wins over the derived route", () => {
    const inverse: FxRateInput = { base: "USD", quote: "SAR", rate: 4, asOf: new Date("2026-01-01") };
    const result = convertAmount(100, "SAR", "USD", [sarOmr, usdOmr, inverse]);
    expect(result.ok && result.rate).toBeCloseTo(0.25, 10);
    expect(result.ok && result.viaHub).toBeUndefined();
  });
});

describe("convertAmount ignores unusable stored rates", () => {
  const at = new Date("2026-07-01");

  it("a stored rate of zero gives no result (no 0 value, no divide-by-zero)", () => {
    const zero: FxRateInput[] = [{ base: "USD", quote: "OMR", rate: 0, asOf: at }];
    expect(convertAmount(100, "USD", "OMR", zero).ok).toBe(false);
    // The inverse direction would divide by zero — must also be missing.
    expect(convertAmount(100, "OMR", "USD", zero).ok).toBe(false);
  });

  it("a negative stored rate gives no result", () => {
    const negative: FxRateInput[] = [{ base: "USD", quote: "OMR", rate: -0.385, asOf: at }];
    expect(convertAmount(100, "USD", "OMR", negative).ok).toBe(false);
    expect(convertAmount(100, "OMR", "USD", negative).ok).toBe(false);
  });

  it("a bad leg stops the route through the rial", () => {
    const rates: FxRateInput[] = [
      { base: "SAR", quote: "OMR", rate: 0, asOf: at },
      { base: "USD", quote: "OMR", rate: 0.385, asOf: at },
    ];
    expect(convertAmount(100, "SAR", "USD", rates)).toEqual({
      ok: false,
      missingRate: { from: "SAR", to: "USD" },
    });
  });

  it("skips a bad newer row and uses the older good one", () => {
    const rates: FxRateInput[] = [
      { base: "USD", quote: "OMR", rate: 0.385, asOf: new Date("2026-01-01") },
      { base: "USD", quote: "OMR", rate: 0, asOf: new Date("2026-07-01") },
    ];
    const result = convertAmount(100, "USD", "OMR", rates);
    expect(result.ok && result.rate).toBe(0.385);
  });

  it("never returns NaN or Infinity", () => {
    const rates: FxRateInput[] = [
      { base: "USD", quote: "OMR", rate: Number.NaN, asOf: at },
      { base: "SAR", quote: "OMR", rate: Number.POSITIVE_INFINITY, asOf: at },
    ];
    expect(convertAmount(1, "USD", "OMR", rates).ok).toBe(false);
    expect(convertAmount(1, "SAR", "USD", rates).ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { computeConsensus, verdictForScore } from "@/lib/ai/consensus";

describe("computeConsensus — unanimous votes", () => {
  it("six unanimous full-confidence BUY votes reach the top of the range", () => {
    const votes = Array.from({ length: 6 }, () => ({
      recommendation: "BUY" as const,
      confidence: 100,
    }));
    expect(computeConsensus(votes)).toEqual({ score: 100, verdict: "BUY" });
  });

  it("six unanimous full-confidence SELL votes reach the bottom of the range", () => {
    const votes = Array.from({ length: 6 }, () => ({
      recommendation: "SELL" as const,
      confidence: 100,
    }));
    expect(computeConsensus(votes)).toEqual({ score: 0, verdict: "SELL" });
  });

  it("six unanimous HOLD votes (any confidence) stay exactly at neutral 50", () => {
    const votes = Array.from({ length: 6 }, () => ({
      recommendation: "HOLD" as const,
      confidence: 90,
    }));
    expect(computeConsensus(votes)).toEqual({ score: 50, verdict: "HOLD" });
  });
});

describe("computeConsensus — split votes", () => {
  it("equal, equally-confident BUY and SELL votes cancel out to neutral", () => {
    const votes = [
      { recommendation: "BUY" as const, confidence: 80 },
      { recommendation: "BUY" as const, confidence: 80 },
      { recommendation: "BUY" as const, confidence: 80 },
      { recommendation: "SELL" as const, confidence: 80 },
      { recommendation: "SELL" as const, confidence: 80 },
      { recommendation: "SELL" as const, confidence: 80 },
    ];
    expect(computeConsensus(votes)).toEqual({ score: 50, verdict: "HOLD" });
  });

  it("a majority tilts the score toward its side without reaching the extreme", () => {
    const votes = [
      { recommendation: "BUY" as const, confidence: 100 },
      { recommendation: "BUY" as const, confidence: 100 },
      { recommendation: "BUY" as const, confidence: 100 },
      { recommendation: "BUY" as const, confidence: 100 },
      { recommendation: "SELL" as const, confidence: 100 },
      { recommendation: "HOLD" as const, confidence: 100 },
    ];
    // +4 votes worth of upward movement, -1 vote worth of downward movement,
    // out of 6 votes each worth 50/6: 50 + (4-1) * (50/6) = 75.
    const result = computeConsensus(votes);
    expect(result.score).toBe(75);
    expect(result.verdict).toBe("BUY");
  });
});

describe("computeConsensus — zero confidence", () => {
  it("a zero-confidence vote contributes no movement at all", () => {
    const votes = [
      { recommendation: "BUY" as const, confidence: 0 },
      { recommendation: "SELL" as const, confidence: 0 },
    ];
    expect(computeConsensus(votes)).toEqual({ score: 50, verdict: "HOLD" });
  });

  it("mixing a zero-confidence vote with a confident one only moves by the confident one's share", () => {
    const votes = [
      { recommendation: "BUY" as const, confidence: 100 },
      { recommendation: "SELL" as const, confidence: 0 },
    ];
    // Only the first vote moves anything: 50 + 1 * 1.0 * (50/2) = 75.
    expect(computeConsensus(votes)).toEqual({ score: 75, verdict: "BUY" });
  });
});

describe("computeConsensus — clamping", () => {
  it("clamps an out-of-range confidence value rather than letting it skew the score", () => {
    const votes = [{ recommendation: "BUY" as const, confidence: 250 }];
    // Should behave exactly as confidence: 100 would.
    expect(computeConsensus(votes)).toEqual(
      computeConsensus([{ recommendation: "BUY", confidence: 100 }]),
    );
  });

  it("clamps a negative confidence value up to zero movement", () => {
    const votes = [{ recommendation: "SELL" as const, confidence: -50 }];
    expect(computeConsensus(votes)).toEqual(
      computeConsensus([{ recommendation: "SELL", confidence: 0 }]),
    );
  });

  it("the final score never leaves 0-100 even for an empty vote list", () => {
    expect(computeConsensus([])).toEqual({ score: 50, verdict: "HOLD" });
  });
});

describe("computeConsensus — verdict band edges (34/35, 64/65)", () => {
  it("score 34 is SELL, score 35 is HOLD (a single vote isolates the exact boundary)", () => {
    expect(computeConsensus([{ recommendation: "SELL", confidence: 32 }])).toEqual({
      score: 34,
      verdict: "SELL",
    });
    expect(computeConsensus([{ recommendation: "SELL", confidence: 30 }])).toEqual({
      score: 35,
      verdict: "HOLD",
    });
  });

  it("score 64 is HOLD, score 65 is BUY", () => {
    expect(computeConsensus([{ recommendation: "BUY", confidence: 28 }])).toEqual({
      score: 64,
      verdict: "HOLD",
    });
    expect(computeConsensus([{ recommendation: "BUY", confidence: 30 }])).toEqual({
      score: 65,
      verdict: "BUY",
    });
  });
});

describe("verdictForScore", () => {
  it("covers the full 0-100 range across the three bands", () => {
    expect(verdictForScore(0)).toBe("SELL");
    expect(verdictForScore(34)).toBe("SELL");
    expect(verdictForScore(35)).toBe("HOLD");
    expect(verdictForScore(50)).toBe("HOLD");
    expect(verdictForScore(64)).toBe("HOLD");
    expect(verdictForScore(65)).toBe("BUY");
    expect(verdictForScore(100)).toBe("BUY");
  });
});

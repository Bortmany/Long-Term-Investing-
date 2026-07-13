import { describe, expect, it } from "vitest";

import {
  computeConsensusScore,
  verdictForConsensusScore,
  type PersonaVote,
} from "@/lib/ai/consensus";

describe("computeConsensusScore", () => {
  it("computes a single BUY vote: 50 + confidence/6", () => {
    const votes: PersonaVote[] = [{ recommendation: "BUY", confidence: 60 }];
    expect(computeConsensusScore(votes)).toBeCloseTo(60, 5);
  });

  it("computes a single SELL vote: 50 - confidence/6", () => {
    const votes: PersonaVote[] = [{ recommendation: "SELL", confidence: 60 }];
    expect(computeConsensusScore(votes)).toBeCloseTo(40, 5);
  });

  it("a single HOLD vote never moves the score", () => {
    const votes: PersonaVote[] = [{ recommendation: "HOLD", confidence: 100 }];
    expect(computeConsensusScore(votes)).toBe(50);
  });

  it("combines multiple votes of mixed recommendations", () => {
    const votes: PersonaVote[] = [
      { recommendation: "BUY", confidence: 90 }, // +15
      { recommendation: "BUY", confidence: 60 }, // +10
      { recommendation: "SELL", confidence: 30 }, // -5
      { recommendation: "HOLD", confidence: 100 }, // +0
    ];
    // 50 + 15 + 10 - 5 + 0 = 70
    expect(computeConsensusScore(votes)).toBeCloseTo(70, 5);
  });

  it("clamps to 100 when the sum of votes would exceed it", () => {
    const votes: PersonaVote[] = Array.from({ length: 10 }, () => ({
      recommendation: "BUY" as const,
      confidence: 100,
    }));
    expect(computeConsensusScore(votes)).toBe(100);
  });

  it("clamps to 0 when the sum of votes would go below it", () => {
    const votes: PersonaVote[] = Array.from({ length: 10 }, () => ({
      recommendation: "SELL" as const,
      confidence: 100,
    }));
    expect(computeConsensusScore(votes)).toBe(0);
  });

  it("six unanimous BUY votes at confidence 100 exactly saturate to 100", () => {
    const votes: PersonaVote[] = Array.from({ length: 6 }, () => ({
      recommendation: "BUY" as const,
      confidence: 100,
    }));
    expect(computeConsensusScore(votes)).toBe(100);
  });

  it("six unanimous SELL votes at confidence 100 exactly bottom out at 0", () => {
    const votes: PersonaVote[] = Array.from({ length: 6 }, () => ({
      recommendation: "SELL" as const,
      confidence: 100,
    }));
    expect(computeConsensusScore(votes)).toBe(0);
  });
});

describe("verdictForConsensusScore", () => {
  it("maps a score of exactly 34 to SELL (the boundary is inclusive)", () => {
    expect(verdictForConsensusScore(34)).toBe("SELL");
  });

  it("maps a score of exactly 35 to HOLD (just above the SELL boundary)", () => {
    expect(verdictForConsensusScore(35)).toBe("HOLD");
  });

  it("maps a score of exactly 64 to HOLD (just below the BUY boundary)", () => {
    expect(verdictForConsensusScore(64)).toBe("HOLD");
  });

  it("maps a score of exactly 65 to BUY (the boundary is inclusive)", () => {
    expect(verdictForConsensusScore(65)).toBe("BUY");
  });

  it("derives the same boundaries from computeConsensusScore's single-vote math", () => {
    // score 65 -> BUY: 50 + 90/6 = 65
    expect(
      verdictForConsensusScore(computeConsensusScore([{ recommendation: "BUY", confidence: 90 }])),
    ).toBe("BUY");
    // score 64 -> HOLD: 50 + 84/6 = 64
    expect(
      verdictForConsensusScore(computeConsensusScore([{ recommendation: "BUY", confidence: 84 }])),
    ).toBe("HOLD");
    // score 35 -> HOLD: 50 - 90/6 = 35
    expect(
      verdictForConsensusScore(computeConsensusScore([{ recommendation: "SELL", confidence: 90 }])),
    ).toBe("HOLD");
    // score 34 -> SELL: 50 - 96/6 = 34
    expect(
      verdictForConsensusScore(computeConsensusScore([{ recommendation: "SELL", confidence: 96 }])),
    ).toBe("SELL");
  });
});

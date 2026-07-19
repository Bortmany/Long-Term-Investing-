import { describe, expect, it } from "vitest";

import { thesisCheckSchema } from "@/lib/ai/schemas";
import { deriveTrendArrow, mapRecommendationToPrisma } from "@/lib/theses/checks";

const validOutput = {
  integrityScore: 72,
  recommendation: "INTACT" as const,
  evidence: {
    supporting: ["Azure growth remains above 15% year over year."],
    weakening: [] as string[],
    improving: ["New Copilot revenue was disclosed for the first time."],
  },
  watchItems: ["Watch the next earnings call for Azure growth guidance."],
  summary: "The thesis still holds; cloud growth remains the key driver.",
};

describe("thesisCheckSchema", () => {
  it("accepts a valid THESIS_CHECK output", () => {
    expect(thesisCheckSchema.safeParse(validOutput).success).toBe(true);
  });

  it("accepts WEAKENING and BROKEN as valid recommendations", () => {
    expect(
      thesisCheckSchema.safeParse({ ...validOutput, recommendation: "WEAKENING" }).success,
    ).toBe(true);
    expect(
      thesisCheckSchema.safeParse({ ...validOutput, recommendation: "BROKEN" }).success,
    ).toBe(true);
  });

  it("rejects an unrecognized recommendation", () => {
    const result = thesisCheckSchema.safeParse({
      ...validOutput,
      recommendation: "STRONG_BUY",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an integrityScore outside 0-100", () => {
    expect(thesisCheckSchema.safeParse({ ...validOutput, integrityScore: 101 }).success).toBe(
      false,
    );
    expect(thesisCheckSchema.safeParse({ ...validOutput, integrityScore: -1 }).success).toBe(
      false,
    );
  });

  it("rejects a non-integer integrityScore", () => {
    expect(thesisCheckSchema.safeParse({ ...validOutput, integrityScore: 71.5 }).success).toBe(
      false,
    );
  });

  it("rejects an empty summary", () => {
    expect(thesisCheckSchema.safeParse({ ...validOutput, summary: "" }).success).toBe(false);
  });

  it("rejects evidence missing one of the three buckets", () => {
    const badEvidence = {
      supporting: validOutput.evidence.supporting,
      weakening: validOutput.evidence.weakening,
    };
    const result = thesisCheckSchema.safeParse({ ...validOutput, evidence: badEvidence });
    expect(result.success).toBe(false);
  });

  it("accepts empty arrays for evidence buckets and watchItems", () => {
    const result = thesisCheckSchema.safeParse({
      ...validOutput,
      evidence: { supporting: [], weakening: [], improving: [] },
      watchItems: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("mapRecommendationToPrisma", () => {
  it("maps each AI recommendation string to the matching Prisma enum value", () => {
    expect(mapRecommendationToPrisma("INTACT")).toBe("INTACT");
    expect(mapRecommendationToPrisma("WEAKENING")).toBe("WEAKENING");
    expect(mapRecommendationToPrisma("BROKEN")).toBe("BROKEN");
  });
});

describe("deriveTrendArrow", () => {
  it("returns 'up' when the latest score is higher than the previous one", () => {
    expect(deriveTrendArrow(80, 65)).toBe("up");
  });

  it("returns 'down' when the latest score is lower than the previous one", () => {
    expect(deriveTrendArrow(50, 70)).toBe("down");
  });

  it("returns 'flat' when the score hasn't changed", () => {
    expect(deriveTrendArrow(60, 60)).toBe("flat");
  });

  it("returns null when there is no previous check to compare against", () => {
    expect(deriveTrendArrow(60, null)).toBeNull();
    expect(deriveTrendArrow(60, undefined)).toBeNull();
  });
});

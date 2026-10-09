import { describe, expect, it } from "vitest";

import { buyAnalysisJsonSchema, buyAnalysisSchema } from "@/lib/ai/schemas";

describe("buy analysis schema", () => {
  it("does not ask the model for the retired allocation field", () => {
    const props = (buyAnalysisJsonSchema as { properties: Record<string, unknown> }).properties;
    expect(props).not.toHaveProperty("suggestedAllocationPct");
    expect(props).toHaveProperty("upsidePct");
  });

  it("still reads old stored rows that carry it", () => {
    const row = {
      score: 70,
      fairValueEstimate: { value: 100, assumptions: ["a"] },
      marginOfSafetyPct: 10,
      upsidePct: 20,
      downsidePct: -5,
      suggestedAllocationPct: 5,
      confidence: 60,
      alternatives: [],
    };
    expect(buyAnalysisSchema.safeParse(row).success).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  checkAiSpendCap,
  DAILY_AI_ANALYSIS_LIMIT,
  startOfUtcDay,
} from "@/lib/ai/spend-cap";

describe("startOfUtcDay", () => {
  it("returns midnight UTC on the same day", () => {
    const now = new Date("2026-07-19T14:32:10.500Z");
    expect(startOfUtcDay(now)).toEqual(new Date("2026-07-19T00:00:00.000Z"));
  });

  it("does not roll over just before midnight", () => {
    const now = new Date("2026-07-19T23:59:59.999Z");
    expect(startOfUtcDay(now)).toEqual(new Date("2026-07-19T00:00:00.000Z"));
  });

  it("rolls over exactly at midnight", () => {
    const now = new Date("2026-07-20T00:00:00.000Z");
    expect(startOfUtcDay(now)).toEqual(new Date("2026-07-20T00:00:00.000Z"));
  });
});

describe("checkAiSpendCap", () => {
  const now = new Date("2026-07-19T12:00:00Z");

  it("allows generation when under the limit", async () => {
    const countSince = vi.fn(async () => DAILY_AI_ANALYSIS_LIMIT - 1);
    const result = await checkAiSpendCap("user-1", { countSince }, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.remaining).toBe(1);
    }
    expect(countSince).toHaveBeenCalledWith("user-1", startOfUtcDay(now));
  });

  it("refuses generation exactly at the limit", async () => {
    const countSince = vi.fn(async () => DAILY_AI_ANALYSIS_LIMIT);
    const result = await checkAiSpendCap("user-1", { countSince }, now);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Plain-English: says what happened, when it resets, and that
      // existing analyses are still available.
      expect(result.message).toContain(String(DAILY_AI_ANALYSIS_LIMIT));
      expect(result.message).toContain("midnight UTC");
      expect(result.message).toContain("still available");
    }
  });

  it("refuses generation over the limit", async () => {
    const countSince = vi.fn(async () => DAILY_AI_ANALYSIS_LIMIT + 5);
    const result = await checkAiSpendCap("user-1", { countSince }, now);
    expect(result.ok).toBe(false);
  });

  it("allows generation with zero prior analyses today", async () => {
    const countSince = vi.fn(async () => 0);
    const result = await checkAiSpendCap("user-1", { countSince }, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.remaining).toBe(DAILY_AI_ANALYSIS_LIMIT);
    }
  });
});

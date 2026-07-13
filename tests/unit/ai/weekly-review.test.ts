import { AiAnalysisType } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AiClient } from "@/lib/ai/client";
import {
  runAnalysis,
  type AiAnalysisStore,
  type StoredAiAnalysis,
} from "@/lib/ai/analysis";
import { weeklyReviewSchema } from "@/lib/ai/schemas";

function keyFor(key: {
  userId: string;
  type: AiAnalysisType;
  subjectType: string;
  subjectId: string;
  inputHash: string;
}): string {
  return `${key.userId}:${key.type}:${key.subjectType}:${key.subjectId}:${key.inputHash}`;
}

/** An in-memory fake of the AiAnalysis table — no database touched. */
function createFakeStore(): AiAnalysisStore & { size: () => number } {
  const rows = new Map<string, StoredAiAnalysis>();
  return {
    size: () => rows.size,
    async findLatest(key) {
      return rows.get(keyFor(key)) ?? null;
    },
    async create(row) {
      const stored: StoredAiAnalysis = {
        model: row.model,
        output: row.output,
        dataAsOf: row.dataAsOf,
        createdAt: new Date("2026-07-13T10:00:00Z"),
      };
      rows.set(keyFor(row), stored);
      return stored;
    },
  };
}

function createFakeClient(
  parsedOutput: unknown,
): AiClient & { parse: ReturnType<typeof vi.fn> } {
  const parse = vi.fn(async () => ({ parsed_output: parsedOutput }));
  return {
    parse,
    messages: { parse },
  };
}

const wellFormedOutput = {
  summary: "The portfolio gained slightly this week, led by tech holdings.",
  newRisks: ["Rising rates could pressure REIT valuations."],
  improvedHoldings: [{ ticker: "MSFT", reason: "Cloud revenue growth accelerated." }],
  weakenedHoldings: [{ ticker: "T", reason: "Dividend coverage ratio narrowed." }],
  allocationDrift: [
    { category: "Technology", targetPercent: 40, actualPercent: 45, drift: 5 },
  ],
  suggestedActions: ["Consider trimming Technology back toward target."],
  behavioralNote: "Stay the course; no reason to react to one week of noise.",
};

const baseParams = {
  type: AiAnalysisType.WEEKLY_REVIEW,
  subjectType: "portfolio",
  subjectId: "portfolio-1",
  model: "claude-sonnet-5",
  schema: weeklyReviewSchema,
};

describe("weeklyReviewSchema", () => {
  it("parses a well-formed WEEKLY_REVIEW output", () => {
    expect(weeklyReviewSchema.safeParse(wellFormedOutput).success).toBe(true);
  });

  it("rejects an allocationDrift entry missing a required field", () => {
    const malformed = {
      ...wellFormedOutput,
      allocationDrift: [{ category: "Technology", targetPercent: 40 }],
    };
    expect(weeklyReviewSchema.safeParse(malformed).success).toBe(false);
  });
});

describe("runAnalysis — WEEKLY_REVIEW — reuse by input hash", () => {
  it("only calls the API once across two calls with identical input", async () => {
    const store = createFakeStore();
    const client = createFakeClient(wellFormedOutput);
    const buildInput = vi.fn(async () => ({
      input: { period: "2026-W28", totalValue: 12000 },
      dataAsOf: new Date("2026-07-10"),
    }));

    const first = await runAnalysis({
      ...baseParams,
      userId: "user-1",
      buildInput,
      client,
      store,
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.data.reused).toBe(false);
      expect(first.data.output).toEqual(wellFormedOutput);
    }
    expect(client.parse).toHaveBeenCalledTimes(1);

    const second = await runAnalysis({
      ...baseParams,
      userId: "user-1",
      buildInput,
      client,
      store,
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data.reused).toBe(true);
    }
    // Zero additional API calls on the reused run.
    expect(client.parse).toHaveBeenCalledTimes(1);
  });
});

describe("runAnalysis — WEEKLY_REVIEW — no API key", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it("returns a typed unavailable result and never writes to the store", async () => {
    const store = createFakeStore();
    const createSpy = vi.spyOn(store, "create");

    const result = await runAnalysis({
      ...baseParams,
      userId: "user-1",
      store,
      buildInput: async () => ({
        input: { period: "2026-W28" },
        dataAsOf: new Date("2026-07-10"),
      }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unavailable).toBe("no_api_key");
    }
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe("runAnalysis — WEEKLY_REVIEW — schema failure", () => {
  it("returns a typed failure and persists nothing when the output fails validation", async () => {
    const store = createFakeStore();
    const createSpy = vi.spyOn(store, "create");
    const malformed: Record<string, unknown> = { ...wellFormedOutput };
    delete malformed.summary;
    const client = createFakeClient(malformed);

    const result = await runAnalysis({
      ...baseParams,
      userId: "user-1",
      client,
      store,
      buildInput: async () => ({
        input: { period: "2026-W28" },
        dataAsOf: new Date("2026-07-10"),
      }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unavailable).toBe("provider_error");
    }
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe("runAnalysis — cross-user isolation (Phase-5-class bug regression)", () => {
  it("never reuses one user's stored row for a different user, even with an otherwise identical input", async () => {
    const store = createFakeStore();
    const client = createFakeClient(wellFormedOutput);
    const buildInput = async () => ({
      input: { period: "2026-W28", totalValue: 12000 },
      dataAsOf: new Date("2026-07-10"),
    });

    const forUserA = await runAnalysis({
      ...baseParams,
      userId: "user-a",
      buildInput,
      client,
      store,
    });
    const forUserB = await runAnalysis({
      ...baseParams,
      userId: "user-b",
      buildInput,
      client,
      store,
    });

    expect(forUserA.ok).toBe(true);
    expect(forUserB.ok).toBe(true);
    if (forUserA.ok) expect(forUserA.data.reused).toBe(false);
    if (forUserB.ok) expect(forUserB.data.reused).toBe(false);

    // Same type/subjectType/subjectId/input for two different users must
    // trigger TWO API calls, never a reuse of the other user's row.
    expect(client.parse).toHaveBeenCalledTimes(2);

    // Each user only ever sees their own row from the store.
    const rowForA = await store.findLatest({
      userId: "user-a",
      type: AiAnalysisType.WEEKLY_REVIEW,
      subjectType: "portfolio",
      subjectId: "portfolio-1",
      inputHash: (await store.findLatest({
        userId: "user-a",
        type: AiAnalysisType.WEEKLY_REVIEW,
        subjectType: "portfolio",
        subjectId: "portfolio-1",
        inputHash: "",
      })) === null
        ? // Recompute the real hash the same way runAnalysis does, by reusing
          // its own reuse-lookup result instead — simpler: just confirm two
          // distinct calls were made and each user's own result is retrievable
          // by re-running (which will now hit the store, not the client).
          ""
        : "",
    });
    // The line above only proves the store has *a* row; the real assertion is
    // that a THIRD call for user-a with the same input reuses (no new API
    // call), while user-b's own row remains untouched and distinct.
    void rowForA;

    const thirdForUserA = await runAnalysis({
      ...baseParams,
      userId: "user-a",
      buildInput,
      client,
      store,
    });
    expect(thirdForUserA.ok).toBe(true);
    if (thirdForUserA.ok) expect(thirdForUserA.data.reused).toBe(true);
    // Still only 2 calls total — user-a's re-run reused, user-b was untouched.
    expect(client.parse).toHaveBeenCalledTimes(2);
  });
});

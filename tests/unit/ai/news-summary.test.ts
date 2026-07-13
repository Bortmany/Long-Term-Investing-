import { AiAnalysisType } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AiClient } from "@/lib/ai/client";
import {
  runAnalysis,
  type AiAnalysisStore,
  type StoredAiAnalysis,
} from "@/lib/ai/analysis";
import { newsSummarySchema } from "@/lib/ai/schemas";

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
  whatHappened: "The company reported quarterly earnings above analyst estimates.",
  whyItMatters: "Revenue growth reaccelerated after two soft quarters.",
  shouldInvestorCare: "Yes — this addresses the growth concern raised last quarter.",
  quotes: [{ text: "We're seeing renewed demand across our cloud segment.", source: "CEO, earnings call" }],
};

const baseParams = {
  type: AiAnalysisType.NEWS_SUMMARY,
  subjectType: "instrument",
  subjectId: "instrument-1",
  model: "claude-haiku-4-5",
  schema: newsSummarySchema,
};

describe("newsSummarySchema", () => {
  it("parses a well-formed NEWS_SUMMARY output, thesisImpact omitted", () => {
    expect(newsSummarySchema.safeParse(wellFormedOutput).success).toBe(true);
  });

  it("parses fine when thesisImpact is present", () => {
    const withThesis = { ...wellFormedOutput, thesisImpact: "Supports the growth thesis." };
    expect(newsSummarySchema.safeParse(withThesis).success).toBe(true);
  });

  it("rejects a quotes entry missing the required text field", () => {
    const malformed = { ...wellFormedOutput, quotes: [{ source: "CEO" }] };
    expect(newsSummarySchema.safeParse(malformed).success).toBe(false);
  });
});

describe("runAnalysis — NEWS_SUMMARY — reuse by input hash", () => {
  it("only calls the API once across two calls with identical input", async () => {
    const store = createFakeStore();
    const client = createFakeClient(wellFormedOutput);
    const buildInput = vi.fn(async () => ({
      input: { instrument: { ticker: "AAPL" }, news: [{ title: "Q3 earnings beat" }] },
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
    if (first.ok) expect(first.data.reused).toBe(false);
    expect(client.parse).toHaveBeenCalledTimes(1);

    const second = await runAnalysis({
      ...baseParams,
      userId: "user-1",
      buildInput,
      client,
      store,
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.data.reused).toBe(true);
    expect(client.parse).toHaveBeenCalledTimes(1);
  });
});

describe("runAnalysis — NEWS_SUMMARY — no API key", () => {
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
        input: { instrument: { ticker: "AAPL" }, news: [] },
        dataAsOf: new Date("2026-07-10"),
      }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.unavailable).toBe("no_api_key");
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe("runAnalysis — NEWS_SUMMARY — schema failure", () => {
  it("returns a typed failure and persists nothing when the output fails validation", async () => {
    const store = createFakeStore();
    const createSpy = vi.spyOn(store, "create");
    const malformed: Record<string, unknown> = { ...wellFormedOutput };
    delete malformed.whatHappened;
    const client = createFakeClient(malformed);

    const result = await runAnalysis({
      ...baseParams,
      userId: "user-1",
      client,
      store,
      buildInput: async () => ({
        input: { instrument: { ticker: "AAPL" }, news: [] },
        dataAsOf: new Date("2026-07-10"),
      }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.unavailable).toBe("provider_error");
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe("runAnalysis — cross-user isolation (Phase-5-class bug regression)", () => {
  it("never reuses one user's stored row for a different user, even with an otherwise identical input", async () => {
    const store = createFakeStore();
    const client = createFakeClient(wellFormedOutput);
    const buildInput = async () => ({
      input: { instrument: { ticker: "AAPL" }, news: [{ title: "Q3 earnings beat" }] },
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
  });
});

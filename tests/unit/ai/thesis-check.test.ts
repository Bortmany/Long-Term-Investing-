import { AiAnalysisType } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AiClient } from "@/lib/ai/client";
import {
  runAnalysis,
  type AiAnalysisStore,
  type StoredAiAnalysis,
} from "@/lib/ai/analysis";
import { thesisCheckSchema } from "@/lib/ai/schemas";

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
  integrityScore: 72,
  recommendation: "INTACT" as const,
  evidence: {
    supporting: ["Azure revenue grew 28% YoY."],
    weakening: ["Capex is rising faster than revenue."],
    improving: ["Operating margin ticked up."],
  },
  watchItems: ["Watch cloud capex vs. revenue growth."],
  summary: "The thesis still holds; recurring revenue remains strong.",
};

const baseParams = {
  userId: "user-1",
  type: AiAnalysisType.THESIS_CHECK,
  subjectType: "thesis",
  subjectId: "thesis-1",
  model: "claude-sonnet-5",
  schema: thesisCheckSchema,
};

describe("thesisCheckSchema", () => {
  it("parses a well-formed THESIS_CHECK output", () => {
    const result = thesisCheckSchema.safeParse(wellFormedOutput);
    expect(result.success).toBe(true);
  });

  it("rejects a recommendation outside INTACT/WEAKENING/BROKEN", () => {
    const result = thesisCheckSchema.safeParse({
      ...wellFormedOutput,
      recommendation: "STRONG_BUY",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an integrityScore above 100", () => {
    const result = thesisCheckSchema.safeParse({
      ...wellFormedOutput,
      integrityScore: 150,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an integrityScore below 0", () => {
    const result = thesisCheckSchema.safeParse({
      ...wellFormedOutput,
      integrityScore: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric integrityScore", () => {
    const result = thesisCheckSchema.safeParse({
      ...wellFormedOutput,
      integrityScore: "seventy-two",
    });
    expect(result.success).toBe(false);
  });
});

describe("runAnalysis — THESIS_CHECK — reuse by input hash", () => {
  it("only calls the API once across two calls with identical input", async () => {
    const store = createFakeStore();
    const client = createFakeClient(wellFormedOutput);
    const buildInput = vi.fn(async () => ({
      input: { thesis: { statement: "Durable moat, growing dividend." } },
      dataAsOf: new Date("2026-07-10"),
    }));

    const first = await runAnalysis({ ...baseParams, buildInput, client, store });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.data.reused).toBe(false);
      expect(first.data.output).toEqual(wellFormedOutput);
    }
    expect(client.parse).toHaveBeenCalledTimes(1);

    const second = await runAnalysis({ ...baseParams, buildInput, client, store });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data.reused).toBe(true);
      expect(second.data.output).toEqual(wellFormedOutput);
    }
    // Zero additional API calls on the reused run.
    expect(client.parse).toHaveBeenCalledTimes(1);
  });
});

describe("runAnalysis — THESIS_CHECK — no API key", () => {
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
      store,
      // No `client` override either — this exercises the real
      // createAiClient() path, which must see the env var is unset.
      buildInput: async () => ({
        input: { thesis: { statement: "Durable moat." } },
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

describe("runAnalysis — THESIS_CHECK — schema failure", () => {
  it("returns a typed failure and persists nothing when integrityScore is missing", async () => {
    const store = createFakeStore();
    const createSpy = vi.spyOn(store, "create");
    const missingScore: Record<string, unknown> = { ...wellFormedOutput };
    delete missingScore.integrityScore;
    const client = createFakeClient(missingScore);

    const result = await runAnalysis({
      ...baseParams,
      client,
      store,
      buildInput: async () => ({
        input: { thesis: { statement: "Durable moat." } },
        dataAsOf: new Date("2026-07-10"),
      }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unavailable).toBe("provider_error");
    }
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("returns a typed failure and persists nothing when recommendation is invalid", async () => {
    const store = createFakeStore();
    const createSpy = vi.spyOn(store, "create");
    const client = createFakeClient({
      ...wellFormedOutput,
      recommendation: "SELL_EVERYTHING",
    });

    const result = await runAnalysis({
      ...baseParams,
      client,
      store,
      buildInput: async () => ({
        input: { thesis: { statement: "Durable moat." } },
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

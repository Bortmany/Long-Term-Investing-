import { AiAnalysisType } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { AiClient } from "@/lib/ai/client";
import {
  runAnalysis,
  stableStringify,
  type AiAnalysisStore,
  type StoredAiAnalysis,
} from "@/lib/ai/analysis";

// A tiny schema, independent of the real HEALTH_SCORE/STOCK_SCORE shapes, so
// these tests exercise the engine itself rather than any one phase's schema.
const testSchema = z.object({
  verdict: z.string(),
  confidence: z.number(),
});

function keyFor(key: {
  type: AiAnalysisType;
  subjectType: string;
  subjectId: string;
  inputHash: string;
}): string {
  return `${key.type}:${key.subjectType}:${key.subjectId}:${key.inputHash}`;
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

const baseParams = {
  type: AiAnalysisType.HEALTH_SCORE,
  subjectType: "portfolio",
  subjectId: "portfolio-1",
  model: "claude-sonnet-5",
  schema: testSchema,
};

describe("stableStringify", () => {
  it("hashes identically regardless of key order", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it("hashes differently for different values", () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});

describe("runAnalysis — reuse by input hash", () => {
  it("only calls the API once across two calls with identical input", async () => {
    const store = createFakeStore();
    const client = createFakeClient({ verdict: "HOLD", confidence: 70 });
    const buildInput = vi.fn(async () => ({
      input: { holdings: ["AAPL", "MSFT"] },
      dataAsOf: new Date("2026-07-10"),
    }));

    const first = await runAnalysis({ ...baseParams, buildInput, client, store });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.data.reused).toBe(false);
      expect(first.data.output).toEqual({ verdict: "HOLD", confidence: 70 });
    }
    expect(client.parse).toHaveBeenCalledTimes(1);

    const second = await runAnalysis({ ...baseParams, buildInput, client, store });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data.reused).toBe(true);
      expect(second.data.output).toEqual({ verdict: "HOLD", confidence: 70 });
    }
    // Zero additional API calls on the reused run.
    expect(client.parse).toHaveBeenCalledTimes(1);
  });

  it("calls the API again when the input changes (different hash)", async () => {
    const store = createFakeStore();
    const client = createFakeClient({ verdict: "HOLD", confidence: 70 });

    await runAnalysis({
      ...baseParams,
      client,
      store,
      buildInput: async () => ({ input: { holdings: ["AAPL"] }, dataAsOf: new Date("2026-07-10") }),
    });
    await runAnalysis({
      ...baseParams,
      client,
      store,
      buildInput: async () => ({ input: { holdings: ["MSFT"] }, dataAsOf: new Date("2026-07-11") }),
    });

    expect(client.parse).toHaveBeenCalledTimes(2);
  });
});

describe("runAnalysis — no API key", () => {
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
      buildInput: async () => ({ input: { a: 1 }, dataAsOf: new Date("2026-07-10") }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unavailable).toBe("no_api_key");
    }
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe("runAnalysis — schema failure", () => {
  it("returns a typed failure and persists nothing when the model's output fails validation", async () => {
    const store = createFakeStore();
    const createSpy = vi.spyOn(store, "create");
    // Missing `confidence`, wrong type for `verdict` — fails testSchema.
    const client = createFakeClient({ verdict: 123 });

    const result = await runAnalysis({
      ...baseParams,
      client,
      store,
      buildInput: async () => ({ input: { a: 1 }, dataAsOf: new Date("2026-07-10") }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unavailable).toBe("provider_error");
    }
    expect(createSpy).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AiAnalysis, AiAnalysisType } from "@prisma/client";

import {
  computeInputHash,
  runAnalysis,
  type AiAnalysisStore,
  type RunAnalysisDeps,
} from "@/lib/ai/analysis";
import type { AiClientResult, AiMessagesClient } from "@/lib/ai/client";
import type { SpendCapResult } from "@/lib/ai/spend-cap";

const noteSchema = z.object({ note: z.string(), score: z.number() });

const SUBJECT = {
  userId: "user-1",
  type: "HEALTH_SCORE" as AiAnalysisType,
  subjectType: "portfolio" as const,
  subjectId: "portfolio-1",
};

function makeRow(overrides: Partial<AiAnalysis> = {}): AiAnalysis {
  return {
    id: "row-seed",
    userId: SUBJECT.userId,
    type: SUBJECT.type,
    subjectType: SUBJECT.subjectType,
    subjectId: SUBJECT.subjectId,
    model: "claude-sonnet-5",
    inputHash: "seeded-hash",
    output: { note: "stored", score: 50 },
    dataAsOf: new Date("2026-07-01"),
    createdAt: new Date("2026-07-01"),
    ...overrides,
  };
}

/** In-memory fake of the AiAnalysis persistence seam — no real database. */
function makeStore(seed: AiAnalysis[] = []) {
  const rows = [...seed];
  const findFirst = vi.fn(
    async ({ userId, type, subjectType, subjectId, inputHash }) =>
      rows.find(
        (row) =>
          row.userId === userId &&
          row.type === type &&
          row.subjectType === subjectType &&
          row.subjectId === subjectId &&
          row.inputHash === inputHash,
      ) ?? null,
  );
  const create = vi.fn(async (data) => {
    const row = makeRow({ ...data, id: `row-${rows.length + 1}`, createdAt: new Date() });
    rows.push(row);
    return row;
  });
  return { store: { findFirst, create } as AiAnalysisStore, rows, findFirst, create };
}

/** A fake Anthropic client that always returns the given JSON text. */
function makeClient(responseText: string) {
  const create = vi.fn(async () => ({
    content: [{ type: "text", text: responseText }],
  })) as unknown as AiMessagesClient["messages"]["create"];
  return { create, client: { messages: { create } } };
}

function okGetClient(client: AiMessagesClient) {
  return vi.fn((): AiClientResult => ({ ok: true, client }));
}

function noKeyGetClient() {
  return vi.fn((): AiClientResult => ({ ok: false, unavailable: "no_api_key" }));
}

function allowingSpendCap() {
  return vi.fn(async (): Promise<SpendCapResult> => ({ ok: true, remaining: 24 }));
}

function refusingSpendCap() {
  return vi.fn(
    async (): Promise<SpendCapResult> => ({
      ok: false,
      message: "You've reached today's limit of 25 new AI analyses.",
    }),
  );
}

describe("runAnalysis — reuse by input hash", () => {
  it("returns the stored row and makes zero client/spend-cap calls", async () => {
    const input = { holdings: 3 };
    const dataAsOf = new Date("2026-07-10");
    const inputHash = computeInputHash(input);
    const { store, create } = makeStore([
      makeRow({ inputHash, output: { note: "reused", score: 77 } }),
    ]);
    const { create: clientCreate, client } = makeClient(JSON.stringify({ note: "fresh", score: 99 }));
    const getClient = okGetClient(client);
    const checkSpendCap = allowingSpendCap();

    const result = await runAnalysis(
      { ...SUBJECT, model: "claude-sonnet-5", buildInput: async () => ({ input, dataAsOf }), schema: noteSchema },
      { store, getClient, checkSpendCap } satisfies RunAnalysisDeps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ note: "reused", score: 77 });
    }
    expect(clientCreate).not.toHaveBeenCalled();
    expect(checkSpendCap).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("runAnalysis — no API key", () => {
  it("returns a typed unavailable result and persists nothing", async () => {
    const { store, create } = makeStore();
    const getClient = noKeyGetClient();
    const checkSpendCap = allowingSpendCap();

    const result = await runAnalysis(
      {
        ...SUBJECT,
        model: "claude-sonnet-5",
        buildInput: async () => ({ input: { x: 1 }, dataAsOf: new Date() }),
        schema: noteSchema,
      },
      { store, getClient, checkSpendCap },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unavailable).toBe("no_api_key");
    }
    expect(create).not.toHaveBeenCalled();
  });
});

describe("runAnalysis — schema mismatch", () => {
  it("returns a typed failure and persists nothing", async () => {
    const { store, create } = makeStore();
    // Missing the required "score" field.
    const { client } = makeClient(JSON.stringify({ note: "incomplete" }));
    const getClient = okGetClient(client);
    const checkSpendCap = allowingSpendCap();

    const result = await runAnalysis(
      {
        ...SUBJECT,
        model: "claude-sonnet-5",
        buildInput: async () => ({ input: { x: 1 }, dataAsOf: new Date() }),
        schema: noteSchema,
      },
      { store, getClient, checkSpendCap },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unavailable).toBe("schema_mismatch");
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("also fails cleanly when the response isn't JSON at all", async () => {
    const { store, create } = makeStore();
    const { client } = makeClient("not json");
    const getClient = okGetClient(client);
    const checkSpendCap = allowingSpendCap();

    const result = await runAnalysis(
      {
        ...SUBJECT,
        model: "claude-sonnet-5",
        buildInput: async () => ({ input: { x: 2 }, dataAsOf: new Date() }),
        schema: noteSchema,
      },
      { store, getClient, checkSpendCap },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unavailable).toBe("schema_mismatch");
    }
    expect(create).not.toHaveBeenCalled();
  });
});

describe("runAnalysis — spend cap", () => {
  it("refuses a genuinely new generation at the limit, but hash-reuse still works", async () => {
    const reusedInput = { holdings: 9 };
    const reusedHash = computeInputHash(reusedInput);
    const { store } = makeStore([makeRow({ inputHash: reusedHash })]);
    const { create: clientCreate, client } = makeClient(JSON.stringify({ note: "n", score: 1 }));
    const getClient = okGetClient(client);
    const checkSpendCap = refusingSpendCap();

    // A brand-new input: never generated before, so the cap applies.
    const refused = await runAnalysis(
      {
        ...SUBJECT,
        model: "claude-sonnet-5",
        buildInput: async () => ({ input: { holdings: 10 }, dataAsOf: new Date() }),
        schema: noteSchema,
      },
      { store, getClient, checkSpendCap },
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.unavailable).toBe("spend_cap");
    }
    expect(clientCreate).not.toHaveBeenCalled();

    // An input matching a stored analysis: reuse bypasses the cap entirely.
    const reused = await runAnalysis(
      {
        ...SUBJECT,
        model: "claude-sonnet-5",
        buildInput: async () => ({ input: reusedInput, dataAsOf: new Date() }),
        schema: noteSchema,
      },
      { store, getClient, checkSpendCap },
    );
    expect(reused.ok).toBe(true);
    expect(checkSpendCap).toHaveBeenCalledTimes(1); // only from the refused call above
    expect(clientCreate).not.toHaveBeenCalled();
  });
});

describe("runAnalysis — success", () => {
  it("persists exactly one row with the correct userId and inputHash", async () => {
    const input = { holdings: 5, cashPct: 12 };
    const dataAsOf = new Date("2026-07-15");
    const { store, create } = makeStore();
    const { client } = makeClient(JSON.stringify({ note: "looks healthy", score: 82 }));
    const getClient = okGetClient(client);
    const checkSpendCap = allowingSpendCap();

    const result = await runAnalysis(
      { ...SUBJECT, model: "claude-sonnet-5", buildInput: async () => ({ input, dataAsOf }), schema: noteSchema },
      { store, getClient, checkSpendCap },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ note: "looks healthy", score: 82 });
      expect(result.analysis.inputHash).toBe(computeInputHash(input));
      expect(result.analysis.userId).toBe(SUBJECT.userId);
    }
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: SUBJECT.userId,
        type: SUBJECT.type,
        subjectType: SUBJECT.subjectType,
        subjectId: SUBJECT.subjectId,
        inputHash: computeInputHash(input),
        dataAsOf,
      }),
    );
  });
});

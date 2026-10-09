// The spend cap wired into the AI engine (go-public spec B2): a refusal
// carries its limit code/link up to the action result; reuse by input hash
// never touches the cap even at the limit; and the in-flight reservation is
// released whether the run succeeds or fails.
import { describe, expect, it, vi } from "vitest";
import type { AiAnalysis } from "@prisma/client";
import { z } from "zod";
import { computeInputHash, runAnalysis, type AiAnalysisStore } from "@/lib/ai/analysis";
import type { AiClientResult, AiMessagesClient } from "@/lib/ai/client";
import {
  checkAiSpendCap,
  createMemoryAiReservationStore,
  type SpendCapDeps,
} from "@/lib/ai/spend-cap";
import { aiRunError } from "@/lib/action-result";
import { logger } from "@/lib/logger";

const NOW = new Date("2026-09-30T12:00:00Z");
const schema = z.object({ note: z.string() });
const SUBJECT = {
  userId: "user-1",
  type: "HEALTH_SCORE" as const,
  subjectType: "portfolio" as const,
  subjectId: "p-1",
  model: "claude-test",
  schema,
  now: NOW,
};

function storeWith(rows: AiAnalysis[] = []): AiAnalysisStore {
  return {
    findFirst: async ({ inputHash }) => rows.find((r) => r.inputHash === inputHash) ?? null,
    create: async (data) =>
      ({ ...data, id: "new", createdAt: NOW, output: data.output }) as unknown as AiAnalysis,
  };
}

function clientReturning(text: string | Error): () => AiClientResult {
  const client: AiMessagesClient = {
    messages: {
      create: vi.fn(async () => {
        if (text instanceof Error) throw text;
        return { content: [{ type: "text", text }] } as never;
      }),
    },
  };
  return () => ({ ok: true, client });
}

function capDeps(usedToday: number): SpendCapDeps & {
  reservations: ReturnType<typeof createMemoryAiReservationStore>;
} {
  const reservations = createMemoryAiReservationStore();
  return {
    countSince: vi.fn(async () => usedToday),
    countAllSince: vi.fn(async () => usedToday),
    getPlan: async () => "FREE",
    reservations,
    env: {},
  };
}

const inFlight = (deps: ReturnType<typeof capDeps>) =>
  deps.reservations.count("ai-inflight:user:user-1");

describe("runAnalysis + the real spend cap", () => {
  it("a refusal carries the limit code up to the action result (no upgrade link while billing is off)", async () => {
    const deps = capDeps(2);
    const result = await runAnalysis(
      { ...SUBJECT, buildInput: async () => ({ input: { a: 1 }, dataAsOf: NOW }) },
      {
        store: storeWith(),
        getClient: clientReturning('{"note":"x"}'),
        checkSpendCap: (u, _d, n) => checkAiSpendCap(u, deps, n),
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.unavailable).toBe("spend_cap");
    expect(result.limit).toMatchObject({ code: "AI_LIMIT_FREE_DAILY", reason: "user_daily" });
    const failure = aiRunError(result);
    expect(failure).toEqual({ ok: false, error: result.message, code: "AI_LIMIT_FREE_DAILY" });
  });

  it("reuse by input hash never calls the cap, even when the user is at the limit", async () => {
    const deps = capDeps(2);
    const input = { a: 2 };
    const stored = {
      id: "old",
      inputHash: computeInputHash(input),
      output: { note: "saved earlier" },
      createdAt: NOW,
    } as unknown as AiAnalysis;
    const checkSpendCap = vi.fn((u: string, _d?: SpendCapDeps, n?: Date) => checkAiSpendCap(u, deps, n));

    const result = await runAnalysis(
      { ...SUBJECT, buildInput: async () => ({ input, dataAsOf: NOW }) },
      { store: storeWith([stored]), getClient: clientReturning('{"note":"x"}'), checkSpendCap },
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.note).toBe("saved earlier");
    expect(checkSpendCap).not.toHaveBeenCalled();
    expect(deps.countSince).not.toHaveBeenCalled();
  });

  it("releases the in-flight reservation after a successful run", async () => {
    const deps = capDeps(0);
    const result = await runAnalysis(
      { ...SUBJECT, buildInput: async () => ({ input: { a: 3 }, dataAsOf: NOW }) },
      {
        store: storeWith(),
        getClient: clientReturning('{"note":"fresh"}'),
        checkSpendCap: (u, _d, n) => checkAiSpendCap(u, deps, n),
      },
    );
    expect(result.ok).toBe(true);
    expect(inFlight(deps)).toBe(0);
  });

  it("releases the in-flight reservation after a failed run", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});
    const deps = capDeps(0);
    const result = await runAnalysis(
      { ...SUBJECT, buildInput: async () => ({ input: { a: 4 }, dataAsOf: NOW }) },
      {
        store: storeWith(),
        getClient: clientReturning(new Error("model unavailable")),
        checkSpendCap: (u, _d, n) => checkAiSpendCap(u, deps, n),
      },
    );
    expect(result.ok).toBe(false);
    expect(inFlight(deps)).toBe(0);
    vi.restoreAllMocks();
  });
});

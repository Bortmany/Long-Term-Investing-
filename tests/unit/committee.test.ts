import { describe, expect, it, vi } from "vitest";
import type { AiAnalysis } from "@prisma/client";

import { computeInputHash } from "@/lib/ai/analysis";
import { runCommittee, type RunCommitteeDeps } from "@/lib/ai/committee";
import type { AiAnalysisStore } from "@/lib/ai/analysis";
import type { AiClientResult, AiMessagesClient } from "@/lib/ai/client";
import type { SpendCapResult } from "@/lib/ai/spend-cap";

const USER_ID = "user-1";
const INSTRUMENT_ID = "instrument-1";

const PERSONA_VOTE_FIXTURE = {
  recommendation: "BUY",
  confidence: 80,
  reasoning: "Strong fundamentals and durable moat.",
  evidence: ["Revenue grew 12% year over year."],
  risks: ["Margins could compress if input costs rise."],
  counterarguments: ["A value investor would call the multiple stretched."],
};

const SYNTHESIS_FIXTURE = {
  disagreements: ["All six lenses agreed with no material disagreement."],
  wouldChangeVerdict: ["If quarterly margins fall below 18%."],
  thesisAssessment: null as string | null,
};

function makeRow(overrides: Partial<AiAnalysis> = {}): AiAnalysis {
  return {
    id: "row-seed",
    userId: USER_ID,
    type: "COMMITTEE",
    subjectType: "instrument",
    subjectId: INSTRUMENT_ID,
    model: "claude-sonnet-5",
    inputHash: "seeded-hash",
    output: {
      verdict: "BUY",
      consensusScore: 75,
      votes: [
        { persona: "value", ...PERSONA_VOTE_FIXTURE },
        { persona: "growth", ...PERSONA_VOTE_FIXTURE },
        { persona: "dividend", ...PERSONA_VOTE_FIXTURE },
        { persona: "quality", ...PERSONA_VOTE_FIXTURE },
        { persona: "macro", ...PERSONA_VOTE_FIXTURE },
        { persona: "contrarian", ...PERSONA_VOTE_FIXTURE },
      ],
      disagreements: SYNTHESIS_FIXTURE.disagreements,
      wouldChangeVerdict: SYNTHESIS_FIXTURE.wouldChangeVerdict,
      thesisAssessment: null,
    },
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

/**
 * A fake Anthropic client for the committee's seven calls: the first six
 * (the persona votes, called in COMMITTEE_PERSONAS order) get
 * `personaResponse`, the seventh (synthesis) gets `synthesisResponse`.
 * `personaResponse` can be a function of the 1-based call index, so a test
 * can make exactly one persona call return something unusable.
 */
function makeClient(
  personaResponse: string | ((callIndex: number) => string),
  synthesisResponse: string = JSON.stringify(SYNTHESIS_FIXTURE),
) {
  let callIndex = 0;
  const create = vi.fn(async () => {
    callIndex += 1;
    const text =
      callIndex <= 6
        ? typeof personaResponse === "function"
          ? personaResponse(callIndex)
          : personaResponse
        : synthesisResponse;
    return { content: [{ type: "text", text }] };
  }) as unknown as AiMessagesClient["messages"]["create"];
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

const VALID_PERSONA_JSON = JSON.stringify(PERSONA_VOTE_FIXTURE);

function baseParams(dataAsOf = new Date("2026-07-15")) {
  return {
    userId: USER_ID,
    instrumentId: INSTRUMENT_ID,
    model: "claude-sonnet-5",
    buildInput: async () => ({ input: { instrument: "AAPL" }, dataAsOf }),
  };
}

describe("runCommittee — happy path", () => {
  it("makes exactly 7 model calls and persists exactly ONE AiAnalysis row", async () => {
    const { store, create: storeCreate } = makeStore();
    const { create: clientCreate, client } = makeClient(VALID_PERSONA_JSON);
    const deps: RunCommitteeDeps = {
      store,
      getClient: okGetClient(client),
      checkSpendCap: allowingSpendCap(),
    };

    const result = await runCommittee(baseParams(), deps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.votes).toHaveLength(6);
      expect(result.data.votes.map((v) => v.persona)).toEqual([
        "value",
        "growth",
        "dividend",
        "quality",
        "macro",
        "contrarian",
      ]);
      expect(result.data.disagreements).toEqual(SYNTHESIS_FIXTURE.disagreements);
    }
    expect(clientCreate).toHaveBeenCalledTimes(7);
    expect(storeCreate).toHaveBeenCalledTimes(1);
  });
});

describe("runCommittee — reuse by input hash", () => {
  it("returns the stored row and makes zero model calls", async () => {
    const input = { instrument: "AAPL" };
    const inputHash = computeInputHash(input);
    const { store, create: storeCreate } = makeStore([makeRow({ inputHash })]);
    const { create: clientCreate, client } = makeClient(VALID_PERSONA_JSON);
    const deps: RunCommitteeDeps = {
      store,
      getClient: okGetClient(client),
      checkSpendCap: allowingSpendCap(),
    };

    const result = await runCommittee(
      { ...baseParams(), buildInput: async () => ({ input, dataAsOf: new Date() }) },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(clientCreate).not.toHaveBeenCalled();
    expect(storeCreate).not.toHaveBeenCalled();
  });
});

describe("runCommittee — no API key", () => {
  it("returns a typed unavailable result and persists nothing", async () => {
    const { store, create: storeCreate } = makeStore();
    const deps: RunCommitteeDeps = {
      store,
      getClient: noKeyGetClient(),
      checkSpendCap: allowingSpendCap(),
    };

    const result = await runCommittee(baseParams(), deps);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.unavailable).toBe("no_api_key");
    expect(storeCreate).not.toHaveBeenCalled();
  });
});

describe("runCommittee — spend cap", () => {
  it("refuses a genuinely new generation at the limit and makes zero model calls", async () => {
    const { store, create: storeCreate } = makeStore();
    const { create: clientCreate, client } = makeClient(VALID_PERSONA_JSON);
    const deps: RunCommitteeDeps = {
      store,
      getClient: okGetClient(client),
      checkSpendCap: refusingSpendCap(),
    };

    const result = await runCommittee(baseParams(), deps);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.unavailable).toBe("spend_cap");
    expect(clientCreate).not.toHaveBeenCalled();
    expect(storeCreate).not.toHaveBeenCalled();
  });
});

describe("runCommittee — one persona fails", () => {
  it("fails the whole run as a typed provider_error and persists nothing", async () => {
    const { store, create: storeCreate } = makeStore();
    // The 3rd persona call (dividend) returns something that doesn't match
    // personaVoteSchema — every other persona's response is valid.
    const { create: clientCreate, client } = makeClient((callIndex) =>
      callIndex === 3 ? JSON.stringify({ note: "not a vote" }) : VALID_PERSONA_JSON,
    );
    const deps: RunCommitteeDeps = {
      store,
      getClient: okGetClient(client),
      checkSpendCap: allowingSpendCap(),
    };

    const result = await runCommittee(baseParams(), deps);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.unavailable).toBe("provider_error");
    // All six personas were attempted (Promise.all waits for every one),
    // but the run bails before ever reaching the synthesis call.
    expect(clientCreate).toHaveBeenCalledTimes(6);
    expect(storeCreate).not.toHaveBeenCalled();
  });
});

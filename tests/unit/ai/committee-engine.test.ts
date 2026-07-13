import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiAnalysisType } from "@prisma/client";

import type { AiClient } from "@/lib/ai/client";
import { runCommittee } from "@/lib/ai/committee-engine";
import { computeConsensusScore, verdictForConsensusScore } from "@/lib/ai/consensus";
import {
  committeeSynthesisSchema,
  personaOutputSchema,
  type CommitteeSynthesisOutput,
  type PersonaOutput,
} from "@/lib/ai/schemas";
import type { AiAnalysisStore, StoredAiAnalysis } from "@/lib/ai/analysis";

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

// The six persona fixtures, in COMMITTEE_PERSONAS order
// (value, growth, dividend, quality, macro, contrarian) — deliberately mixed
// recommendations/confidences so the consensus math is genuinely exercised.
const personaFixtures: PersonaOutput[] = [
  {
    recommendation: "BUY",
    confidence: 90,
    reasoning: "Trading well below intrinsic value.",
    evidence: ["P/E well under sector average."],
    risks: ["Multiple could stay compressed for years."],
    counterarguments: ["The discount may reflect real structural decline."],
  },
  {
    recommendation: "BUY",
    confidence: 80,
    reasoning: "Revenue growth is durable and reinvestment is efficient.",
    evidence: ["Revenue CAGR of 18% over 3 years."],
    risks: ["Growth could decelerate as the market matures."],
    counterarguments: ["Current price already assumes continued growth."],
  },
  {
    recommendation: "HOLD",
    confidence: 50,
    reasoning: "Payout ratio is stable but not growing quickly.",
    evidence: ["Payout ratio steady at 45% for 5 years."],
    risks: ["A downturn could pressure free cash flow."],
    counterarguments: ["Yield is unremarkable versus peers."],
  },
  {
    recommendation: "BUY",
    confidence: 70,
    reasoning: "Strong moat and consistent profitability.",
    evidence: ["Gross margin stable above 60% for a decade."],
    risks: ["Management transition risk next year."],
    counterarguments: ["Moat could erode from new entrants."],
  },
  {
    recommendation: "SELL",
    confidence: 40,
    reasoning: "Rate environment is a headwind for this sector.",
    evidence: ["Sector historically underperforms in rate-hike cycles."],
    risks: ["Rates could fall sooner than expected."],
    counterarguments: ["Company has limited direct rate exposure."],
  },
  {
    recommendation: "SELL",
    confidence: 60,
    reasoning: "The crowd is too optimistic about near-term catalysts.",
    evidence: ["Consensus estimates have been revised up sharply."],
    risks: ["Could be wrong if the catalyst actually lands."],
    counterarguments: ["Historical base rate favors the bulls here."],
  },
];

const synthesisFixture: CommitteeSynthesisOutput = {
  disagreements: ["Value and Contrarian disagree on whether the discount is justified."],
  wouldChangeVerdict: ["A confirmed acceleration in revenue growth next quarter."],
  thesisAssessment: "This analysis broadly supports the stated thesis.",
};

/**
 * A fake AiClient whose parse mock returns the persona fixtures for the
 * first N calls (in COMMITTEE_PERSONAS order, since Promise.all(map(...))
 * invokes each element's async function synchronously in array order) and
 * the synthesis fixture for the 7th call. `overridePersonas` lets a test
 * swap in malformed/failing behavior for specific call indices.
 */
function createFakeClient(options?: {
  personas?: PersonaOutput[];
  synthesis?: CommitteeSynthesisOutput;
  throwOnCallIndex?: number;
}): AiClient & { parse: ReturnType<typeof vi.fn> } {
  const personas = options?.personas ?? personaFixtures;
  const synthesis = options?.synthesis ?? synthesisFixture;
  let callIndex = 0;

  const parse = vi.fn(async () => {
    const index = callIndex++;
    if (options?.throwOnCallIndex === index) {
      throw new Error("simulated provider failure");
    }
    if (index < personas.length) {
      return { parsed_output: personas[index] };
    }
    return { parsed_output: synthesis };
  });

  return { parse, messages: { parse } };
}

const baseParams = {
  subjectId: "instrument-1",
  model: "claude-sonnet-5",
};

const sharedInput = {
  instrument: { ticker: "AAPL", name: "Apple Inc." },
  thesis: null,
  position: null,
};

describe("runCommittee — happy path", () => {
  it("makes exactly 7 calls, persists exactly 1 row, and computes verdict/score deterministically", async () => {
    const store = createFakeStore();
    const client = createFakeClient();

    const result = await runCommittee({
      ...baseParams,
      input: sharedInput,
      dataAsOf: new Date("2026-07-10"),
      client,
      store,
    });

    expect(result.ok).toBe(true);
    expect(client.parse).toHaveBeenCalledTimes(7);
    expect(store.size()).toBe(1);

    const expectedScore = computeConsensusScore(
      personaFixtures.map((p) => ({ recommendation: p.recommendation, confidence: p.confidence })),
    );
    const expectedVerdict = verdictForConsensusScore(expectedScore);

    if (result.ok) {
      expect(result.data.reused).toBe(false);
      expect(result.data.output.consensusScore).toBeCloseTo(expectedScore, 5);
      expect(result.data.output.verdict).toBe(expectedVerdict);
      expect(result.data.output.personas.value).toEqual(personaFixtures[0]);
      expect(result.data.output.personas.contrarian).toEqual(personaFixtures[5]);
      expect(result.data.output.disagreements).toEqual(synthesisFixture.disagreements);
    }
  });
});

describe("runCommittee — reuse by input hash", () => {
  it("shows reused: true on the second call with identical input, with no additional API calls", async () => {
    const store = createFakeStore();
    const client = createFakeClient();

    const first = await runCommittee({
      ...baseParams,
      input: sharedInput,
      dataAsOf: new Date("2026-07-10"),
      client,
      store,
    });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.data.reused).toBe(false);
    expect(client.parse).toHaveBeenCalledTimes(7);

    const second = await runCommittee({
      ...baseParams,
      input: sharedInput,
      dataAsOf: new Date("2026-07-10"),
      client,
      store,
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.data.reused).toBe(true);

    // Zero additional API calls on the reused run.
    expect(client.parse).toHaveBeenCalledTimes(7);
    expect(store.size()).toBe(1);
  });
});

describe("runCommittee — no API key", () => {
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

    const result = await runCommittee({
      ...baseParams,
      input: sharedInput,
      dataAsOf: new Date("2026-07-10"),
      store,
      // No `client` override either — exercises the real createAiClient()
      // path, which must see the env var is unset.
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unavailable).toBe("no_api_key");
    }
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe("runCommittee — no partial write on failure", () => {
  it("persists nothing when the synthesis call throws, even though all 6 personas succeeded", async () => {
    const store = createFakeStore();
    const createSpy = vi.spyOn(store, "create");
    const client = createFakeClient({ throwOnCallIndex: 6 });

    const result = await runCommittee({
      ...baseParams,
      input: sharedInput,
      dataAsOf: new Date("2026-07-10"),
      client,
      store,
    });

    expect(result.ok).toBe(false);
    expect(createSpy).not.toHaveBeenCalled();
    expect(store.size()).toBe(0);
  });

  it("persists nothing when one of the persona calls throws", async () => {
    const store = createFakeStore();
    const createSpy = vi.spyOn(store, "create");
    const client = createFakeClient({ throwOnCallIndex: 2 });

    const result = await runCommittee({
      ...baseParams,
      input: sharedInput,
      dataAsOf: new Date("2026-07-10"),
      client,
      store,
    });

    expect(result.ok).toBe(false);
    expect(createSpy).not.toHaveBeenCalled();
    expect(store.size()).toBe(0);
  });
});

describe("runCommittee — schema-mismatch defense in depth", () => {
  it("persists nothing when a persona output is missing a required field", async () => {
    const store = createFakeStore();
    const createSpy = vi.spyOn(store, "create");
    const malformedPersonas = personaFixtures.map((p, i) => {
      if (i !== 2) return p;
      // Drop a required field to simulate a malformed persona output.
      const rest = { ...p } as Partial<PersonaOutput>;
      delete rest.reasoning;
      return rest as unknown as PersonaOutput;
    });
    const client = createFakeClient({ personas: malformedPersonas });

    const result = await runCommittee({
      ...baseParams,
      input: sharedInput,
      dataAsOf: new Date("2026-07-10"),
      client,
      store,
    });

    expect(result.ok).toBe(false);
    expect(createSpy).not.toHaveBeenCalled();
    expect(store.size()).toBe(0);
  });
});

// Sanity check that our fixtures actually satisfy the schemas used above —
// guards against the test itself drifting from the real shape.
describe("fixtures sanity", () => {
  it("personaFixtures each satisfy personaOutputSchema", () => {
    for (const fixture of personaFixtures) {
      expect(personaOutputSchema.safeParse(fixture).success).toBe(true);
    }
  });

  it("synthesisFixture satisfies committeeSynthesisSchema", () => {
    expect(committeeSynthesisSchema.safeParse(synthesisFixture).success).toBe(true);
  });
});

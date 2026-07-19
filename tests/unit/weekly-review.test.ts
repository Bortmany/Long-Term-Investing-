import { describe, expect, it, vi } from "vitest";
import type { AiAnalysis, WeeklyReview } from "@prisma/client";

import {
  computeInputHash,
  runAnalysis,
  type AiAnalysisStore,
  type RunAnalysisDeps,
} from "@/lib/ai/analysis";
import type { AiClientResult, AiMessagesClient } from "@/lib/ai/client";
import type { SpendCapResult } from "@/lib/ai/spend-cap";
import {
  runWeeklyReviewEngine,
  type RunWeeklyReviewEngineDeps,
  type WeeklyReviewStore,
} from "@/lib/reviews/engine";
import { extractWeeklyReviewFields, extractWeeklyReviewMeta } from "@/lib/reviews/output";
import { newsSummarySchema, type WeeklyReviewOutput } from "@/lib/ai/schemas";

const USER_ID = "user-1";
const PORTFOLIO_ID = "portfolio-1";

const WEEKLY_REVIEW_FIXTURE: WeeklyReviewOutput = {
  summary: "Your portfolio grew modestly this week, led by AAPL.",
  newRisks: ["Tech sector concentration continues to rise."],
  improvedHoldings: [{ ticker: "AAPL", reason: "Price rose 5% on strong earnings." }],
  weakenedHoldings: [],
  allocationDrift: "Technology grew from 40% to 45% of holdings, driven by AAPL's gain.",
  suggestedActions: ["Consider rebalancing if tech concentration keeps rising."],
  behavioralNote: "You've checked this position often since the earnings beat — worth revisiting your original time horizon rather than reacting to one week's move.",
};

const SNAPSHOT_FIXTURE = {
  baseCurrency: "OMR",
  totalValue: 10_000,
  holdingsValue: 9_000,
  cashValue: 1_000,
  holdings: [{ instrumentId: "aapl", ticker: "AAPL", marketValue: 9_000 }],
  sectorAllocation: [{ label: "Technology", sharePercent: 100 }],
  trailingDividendIncome: 200,
};

function makeAiAnalysisRow(overrides: Partial<AiAnalysis> = {}): AiAnalysis {
  return {
    id: "analysis-seed",
    userId: USER_ID,
    type: "WEEKLY_REVIEW",
    subjectType: "portfolio",
    subjectId: PORTFOLIO_ID,
    model: "claude-sonnet-5",
    inputHash: "seeded-hash",
    output: WEEKLY_REVIEW_FIXTURE,
    dataAsOf: new Date("2026-07-13"),
    createdAt: new Date("2026-07-13"),
    ...overrides,
  };
}

/** In-memory fake of the AiAnalysis persistence seam — no real database. */
function makeAiAnalysisStore(seed: AiAnalysis[] = []) {
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
    const row = makeAiAnalysisRow({ ...data, id: `analysis-${rows.length + 1}`, createdAt: new Date() });
    rows.push(row);
    return row;
  });
  return { store: { findFirst, create } as AiAnalysisStore, rows, findFirst, create };
}

/** In-memory fake of the WeeklyReview upsert-by-[userId,period] seam. */
function makeWeeklyReviewStore() {
  const rows: WeeklyReview[] = [];
  const upsert = vi.fn(async ({ userId, period, output }: { userId: string; period: string; output: unknown }) => {
    const index = rows.findIndex((r) => r.userId === userId && r.period === period);
    const row = {
      id: index >= 0 ? rows[index].id : `review-${rows.length + 1}`,
      userId,
      period,
      output,
      createdAt: index >= 0 ? rows[index].createdAt : new Date(),
    } as WeeklyReview;
    if (index >= 0) rows[index] = row;
    else rows.push(row);
    return row;
  });
  return { store: { upsert } as WeeklyReviewStore, rows, upsert };
}

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

function baseParams(overrides: { totalValue?: number } = {}) {
  const snapshot = { ...SNAPSHOT_FIXTURE, totalValue: overrides.totalValue ?? SNAPSHOT_FIXTURE.totalValue };
  return {
    userId: USER_ID,
    portfolioId: PORTFOLIO_ID,
    period: "2026-W29",
    model: "claude-sonnet-5",
    buildInput: async () => ({
      input: { totalValue: snapshot.totalValue },
      dataAsOf: new Date("2026-07-13"),
      snapshot,
      sectorDrift: null,
    }),
  };
}

describe("runWeeklyReviewEngine — reuse by input hash", () => {
  it("makes zero client calls and still upserts the WeeklyReview row", async () => {
    const input = { totalValue: SNAPSHOT_FIXTURE.totalValue };
    const inputHash = computeInputHash(input);
    const { store: aiStore, create: aiCreate } = makeAiAnalysisStore([makeAiAnalysisRow({ inputHash })]);
    const { store: reviewStore, upsert } = makeWeeklyReviewStore();
    const { create: clientCreate, client } = makeClient(JSON.stringify(WEEKLY_REVIEW_FIXTURE));

    const deps: RunWeeklyReviewEngineDeps = {
      store: aiStore,
      weeklyReviewStore: reviewStore,
      getClient: okGetClient(client),
      checkSpendCap: allowingSpendCap(),
    };

    const result = await runWeeklyReviewEngine(baseParams(), deps);

    expect(result.ok).toBe(true);
    expect(clientCreate).not.toHaveBeenCalled();
    expect(aiCreate).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
    if (result.ok) {
      expect(result.review.period).toBe("2026-W29");
    }
  });
});

describe("runWeeklyReviewEngine — no API key", () => {
  it("returns a typed unavailable result and never touches the WeeklyReview store", async () => {
    const { store: aiStore } = makeAiAnalysisStore();
    const { store: reviewStore, upsert } = makeWeeklyReviewStore();

    const deps: RunWeeklyReviewEngineDeps = {
      store: aiStore,
      weeklyReviewStore: reviewStore,
      getClient: noKeyGetClient(),
      checkSpendCap: allowingSpendCap(),
    };

    const result = await runWeeklyReviewEngine(baseParams(), deps);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.unavailable).toBe("no_api_key");
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("runWeeklyReviewEngine — upsert-per-week semantics", () => {
  it("re-running the SAME period replaces that week's row rather than creating a second one", async () => {
    const { store: aiStore } = makeAiAnalysisStore();
    const { store: reviewStore, rows } = makeWeeklyReviewStore();
    const { client } = makeClient(JSON.stringify(WEEKLY_REVIEW_FIXTURE));
    const deps: RunWeeklyReviewEngineDeps = {
      store: aiStore,
      weeklyReviewStore: reviewStore,
      getClient: okGetClient(client),
      checkSpendCap: allowingSpendCap(),
    };

    // First run this week: total value 10,000.
    const first = await runWeeklyReviewEngine(baseParams({ totalValue: 10_000 }), deps);
    expect(first.ok).toBe(true);

    // Re-run the SAME week after the portfolio moved (different input ->
    // different hash -> a genuinely new AiAnalysis row), same period string.
    const second = await runWeeklyReviewEngine(baseParams({ totalValue: 12_000 }), deps);
    expect(second.ok).toBe(true);

    // History stays ONE row per week.
    expect(rows).toHaveLength(1);
    const stored = rows[0].output as { snapshot: { totalValue: number } };
    expect(stored.snapshot.totalValue).toBe(12_000);
  });
});

describe("output envelope — round-trips through extractWeeklyReviewFields/Meta", () => {
  it("the AI fields and caption meta both come back out unchanged", async () => {
    const { store: aiStore } = makeAiAnalysisStore();
    const { store: reviewStore, rows } = makeWeeklyReviewStore();
    const { client } = makeClient(JSON.stringify(WEEKLY_REVIEW_FIXTURE));
    const deps: RunWeeklyReviewEngineDeps = {
      store: aiStore,
      weeklyReviewStore: reviewStore,
      getClient: okGetClient(client),
      checkSpendCap: allowingSpendCap(),
    };

    await runWeeklyReviewEngine(baseParams(), deps);

    const fields = extractWeeklyReviewFields(rows[0].output);
    expect(fields).toEqual(WEEKLY_REVIEW_FIXTURE);

    const meta = extractWeeklyReviewMeta(rows[0].output, new Date("2000-01-01"), "fallback-model");
    expect(meta.model).toBe("claude-sonnet-5");
  });
});

// ---------------------------------------------------------------------------
// NEWS_SUMMARY fixture test with the fake client — proves the generic
// runAnalysis engine handles NEWS_SUMMARY end to end, same as every other
// AiAnalysisType (reuse-by-hash, schema validation, honest nullable fields).
// ---------------------------------------------------------------------------

const NEWS_SUMMARY_FIXTURE = {
  whatHappened: "The company beat quarterly earnings estimates.",
  whyItMatters: "Margins expanded even as revenue growth slowed, easing a key investor worry.",
  thesisImpact: "This supports the thesis's assumption that margins would hold up.",
  shouldInvestorCare: "Yes — this is a meaningful confirmation of the thesis's core assumption.",
  quotes: [
    { quote: "We are pleased with our margin performance this quarter.", source: "Reuters" },
    { quote: "Growth is moderating but profitability remains strong.", source: null },
  ],
};

describe("NEWS_SUMMARY — fixture test with the fake client", () => {
  it("validates and persists a well-formed NEWS_SUMMARY response", async () => {
    const { store, create } = makeAiAnalysisStore();
    const { create: clientCreate, client } = makeClient(JSON.stringify(NEWS_SUMMARY_FIXTURE));
    const deps: RunAnalysisDeps = {
      store,
      getClient: okGetClient(client),
      checkSpendCap: allowingSpendCap(),
    };

    const result = await runAnalysis(
      {
        userId: USER_ID,
        type: "NEWS_SUMMARY",
        subjectType: "instrument",
        subjectId: "instrument-1",
        model: "claude-haiku-4-5",
        buildInput: async () => ({ input: { ticker: "AAPL" }, dataAsOf: new Date("2026-07-10") }),
        schema: newsSummarySchema,
      },
      deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.quotes).toHaveLength(2);
      expect(result.data.quotes[1].source).toBeNull();
      expect(result.data.thesisImpact).toBe(NEWS_SUMMARY_FIXTURE.thesisImpact);
    }
    expect(clientCreate).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("accepts a null thesisImpact when no active thesis was attached", async () => {
    const { store } = makeAiAnalysisStore();
    const noThesis = { ...NEWS_SUMMARY_FIXTURE, thesisImpact: null };
    const { client } = makeClient(JSON.stringify(noThesis));
    const deps: RunAnalysisDeps = {
      store,
      getClient: okGetClient(client),
      checkSpendCap: allowingSpendCap(),
    };

    const result = await runAnalysis(
      {
        userId: USER_ID,
        type: "NEWS_SUMMARY",
        subjectType: "instrument",
        subjectId: "instrument-2",
        model: "claude-haiku-4-5",
        buildInput: async () => ({ input: { ticker: "MSFT" }, dataAsOf: new Date("2026-07-10") }),
        schema: newsSummarySchema,
      },
      deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.thesisImpact).toBeNull();
  });

  it("no key: returns a typed unavailable result and persists nothing", async () => {
    const { store, create } = makeAiAnalysisStore();
    const deps: RunAnalysisDeps = {
      store,
      getClient: noKeyGetClient(),
      checkSpendCap: allowingSpendCap(),
    };

    const result = await runAnalysis(
      {
        userId: USER_ID,
        type: "NEWS_SUMMARY",
        subjectType: "instrument",
        subjectId: "instrument-3",
        model: "claude-haiku-4-5",
        buildInput: async () => ({ input: { ticker: "AAPL" }, dataAsOf: new Date() }),
        schema: newsSummarySchema,
      },
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.unavailable).toBe("no_api_key");
    expect(create).not.toHaveBeenCalled();
  });
});

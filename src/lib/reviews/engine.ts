// The Weekly Review engine (BUILD-PLAN.md Phase 6) — a thin, injectable
// wrapper around the shared runAnalysis() engine (src/lib/ai/analysis.ts)
// plus the WeeklyReview upsert-per-week step, so both halves are
// unit-testable without a real database (tests/unit/weekly-review.test.ts).
//
// THE AI RULE (docs/CONVENTIONS.md) still applies in full via runAnalysis:
// this only ever runs from an explicit action (a button click, or the
// scheduled cron route) — a stored row with a matching input hash is reused
// with zero model calls and zero spend-cap charge, exactly like every other
// AiAnalysisType.

import type { AiAnalysis, Prisma, WeeklyReview } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  runAnalysis,
  type RunAnalysisDeps,
  type RunAnalysisUnavailableReason,
} from "@/lib/ai/analysis";
import { weeklyReviewSchema, type WeeklyReviewOutput } from "@/lib/ai/schemas";
import { buildWeeklyReviewOutputJson } from "./output";
import type { ReviewSectorDelta, ReviewSnapshot } from "./delta";

export interface WeeklyReviewStore {
  upsert(params: { userId: string; period: string; output: unknown }): Promise<WeeklyReview>;
}

/** Default, Prisma-backed store — mirrors src/lib/ai/analysis.ts's `defaultStore`. */
export const defaultWeeklyReviewStore: WeeklyReviewStore = {
  upsert: ({ userId, period, output }) =>
    prisma.weeklyReview.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period, output: output as Prisma.InputJsonValue },
      update: { output: output as Prisma.InputJsonValue },
    }),
};

export type RunWeeklyReviewEngineParams = {
  userId: string;
  portfolioId: string;
  /** The ISO week period this run belongs to, e.g. "2026-W29". */
  period: string;
  model: string;
  /**
   * Produce the snapshot the AI sees, PLUS the raw numeric snapshot/
   * sector-drift this engine persists onto the WeeklyReview row (never asked
   * of the model — see src/lib/reviews/output.ts's file-level comment).
   * Lives in the caller (src/lib/reviews/snapshot.ts), exactly like
   * runAnalysis's own `buildInput` param — this keeps the engine itself easy
   * to unit-test with a trivial fixture instead of a mocked data layer.
   */
  buildInput: () => Promise<{
    input: unknown;
    dataAsOf: Date;
    snapshot: ReviewSnapshot;
    sectorDrift: ReviewSectorDelta[] | null;
  }>;
  now?: Date;
};

export type RunWeeklyReviewEngineResult =
  | { ok: true; data: WeeklyReviewOutput; analysis: AiAnalysis; review: WeeklyReview }
  | { ok: false; unavailable: RunAnalysisUnavailableReason; message: string };

export type RunWeeklyReviewEngineDeps = RunAnalysisDeps & {
  weeklyReviewStore?: WeeklyReviewStore;
};

export async function runWeeklyReviewEngine(
  params: RunWeeklyReviewEngineParams,
  deps: RunWeeklyReviewEngineDeps = {},
): Promise<RunWeeklyReviewEngineResult> {
  // buildInput always runs (runAnalysis calls it before the reuse check), so
  // this is populated on every path — reuse-by-hash included — letting the
  // WeeklyReview row still get upserted (to this week's period) even when
  // the underlying AiAnalysis itself was reused rather than freshly generated.
  let extras: { snapshot: ReviewSnapshot; sectorDrift: ReviewSectorDelta[] | null } | null = null;

  const result = await runAnalysis(
    {
      userId: params.userId,
      type: "WEEKLY_REVIEW",
      subjectType: "portfolio",
      subjectId: params.portfolioId,
      model: params.model,
      now: params.now,
      buildInput: async () => {
        const built = await params.buildInput();
        extras = { snapshot: built.snapshot, sectorDrift: built.sectorDrift };
        return { input: built.input, dataAsOf: built.dataAsOf };
      },
      schema: weeklyReviewSchema,
    },
    deps,
  );

  if (!result.ok) return result;
  // `extras` is always set by this point (buildInput ran to produce `result`).
  const { snapshot, sectorDrift } = extras!;

  const store = deps.weeklyReviewStore ?? defaultWeeklyReviewStore;
  const output = buildWeeklyReviewOutputJson(result.data, result.analysis, snapshot, sectorDrift);
  const review = await store.upsert({ userId: params.userId, period: params.period, output });

  return { ok: true, data: result.data, analysis: result.analysis, review };
}

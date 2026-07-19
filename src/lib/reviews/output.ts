// WeeklyReview.output envelope (BUILD-PLAN.md Phase 6).
//
// One JSON blob holds THREE things side by side, so no schema migration is
// needed to link a WeeklyReview row back to its AiAnalysis caption fields or
// forward to next week's delta:
//
//  1. The AI-authored WEEKLY_REVIEW fields (weeklyReviewSchema in
//     src/lib/ai/schemas.ts) — summary, newRisks, improvedHoldings,
//     weakenedHoldings, allocationDrift (prose), suggestedActions,
//     behavioralNote. Spread at the TOP LEVEL of the envelope so
//     `weeklyReviewSchema.safeParse(output)` still succeeds unchanged (zod
//     objects strip unrecognized keys by default) — the /reviews list and
//     detail pages read those fields exactly like every other stored
//     AiAnalysis output.
//  2. `meta` — the AiPanel caption fields (model, dataAsOf, createdAt) taken
//     straight from the AiAnalysis row runAnalysis just created or reused.
//     WeeklyReview has no columns for these; storing them here avoids a
//     migration while still letting the read-only /reviews/[id] page show
//     the same "Analysis from … · model · based on data as of …" caption
//     every other AiPanel shows.
//  3. `snapshot` (this run's raw numeric portfolio snapshot, for NEXT week's
//     delta) and `sectorDrift` (THIS run's own per-sector delta numbers,
//     computed once in code — never asked of the model, same discipline
//     src/lib/ai/committee.ts uses for consensusScore — so the detail page
//     can render a real Last Week/This Week/Drift table without trusting an
//     AI-echoed number).

import { z } from "zod";
import { weeklyReviewSchema, type WeeklyReviewOutput } from "@/lib/ai/schemas";
import {
  reviewSectorDeltaSchema,
  reviewSnapshotSchema,
  type ReviewSectorDelta,
  type ReviewSnapshot,
} from "./delta";

export const weeklyReviewMetaSchema = z.object({
  model: z.string().min(1),
  dataAsOf: z.string(),
  createdAt: z.string(),
});
export type WeeklyReviewMeta = z.infer<typeof weeklyReviewMetaSchema>;

const envelopeSchema = z.object({
  meta: weeklyReviewMetaSchema.optional(),
  snapshot: reviewSnapshotSchema.optional(),
  sectorDrift: z.array(reviewSectorDeltaSchema).nullable().optional(),
});

/** Build the full JSON blob persisted as WeeklyReview.output. */
export function buildWeeklyReviewOutputJson(
  aiOutput: WeeklyReviewOutput,
  analysis: { model: string; dataAsOf: Date; createdAt: Date },
  snapshot: ReviewSnapshot,
  sectorDrift: ReviewSectorDelta[] | null,
): Record<string, unknown> {
  return {
    ...aiOutput,
    meta: {
      model: analysis.model,
      dataAsOf: analysis.dataAsOf.toISOString(),
      createdAt: analysis.createdAt.toISOString(),
    } satisfies WeeklyReviewMeta,
    snapshot,
    sectorDrift,
  };
}

/**
 * Re-validate the AI-authored fields back out of a stored output blob (the
 * same discipline runAnalysis's own reuse path uses: a row whose payload no
 * longer matches its type's current schema is treated as unreadable, never
 * force-cast).
 */
export function extractWeeklyReviewFields(output: unknown): WeeklyReviewOutput | null {
  const parsed = weeklyReviewSchema.safeParse(output);
  return parsed.success ? parsed.data : null;
}

/**
 * Pull the caption fields back out. Falls back to the WeeklyReview row's own
 * `createdAt` + the given model constant if `meta` is somehow missing or
 * unparseable — a defensive fallback only; every row this app itself creates
 * always writes `meta` via buildWeeklyReviewOutputJson above. Content that
 * exists is never hidden behind a caption that failed to parse.
 */
export function extractWeeklyReviewMeta(
  output: unknown,
  fallbackCreatedAt: Date,
  fallbackModel: string,
): { createdAt: Date; model: string; dataAsOf: Date } {
  const parsed = envelopeSchema.safeParse(output);
  const meta = parsed.success ? parsed.data.meta : undefined;
  if (!meta) {
    return { createdAt: fallbackCreatedAt, model: fallbackModel, dataAsOf: fallbackCreatedAt };
  }
  return {
    createdAt: new Date(meta.createdAt),
    model: meta.model,
    dataAsOf: new Date(meta.dataAsOf),
  };
}

/** Pull the prior run's raw numeric snapshot back out, or null if none/unparseable. */
export function extractWeeklyReviewSnapshot(output: unknown): ReviewSnapshot | null {
  const parsed = envelopeSchema.safeParse(output);
  return parsed.success ? (parsed.data.snapshot ?? null) : null;
}

/** Pull this run's own pre-computed sector-drift table back out for display. */
export function extractSectorDrift(output: unknown): ReviewSectorDelta[] | null {
  const parsed = envelopeSchema.safeParse(output);
  return parsed.success ? (parsed.data.sectorDrift ?? null) : null;
}

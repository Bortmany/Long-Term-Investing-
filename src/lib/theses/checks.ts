// Pure functions for the Thesis Tracker's ThesisCheck data (BUILD-PLAN.md
// Phase 4). No I/O here — everything takes plain data the caller already has
// and returns a typed result, same house style as src/lib/stocks/ratios.ts.
import type { ThesisRecommendation } from "@prisma/client";
import type { ThesisCheckOutput } from "@/lib/ai/schemas";

export type TrendDirection = "up" | "down" | "flat";

/**
 * Compare the latest ThesisCheck's integrity score against the one before it
 * and say which way it moved (ui-spec §5.1's list-row trend arrow, §5.2's
 * "vs previous check"). Returns null when there's no previous check to
 * compare against — the UI shows no arrow at all in that case rather than a
 * fabricated "flat".
 */
export function deriveTrendArrow(
  latestScore: number,
  previousScore: number | null | undefined,
): TrendDirection | null {
  if (previousScore === null || previousScore === undefined) return null;
  if (latestScore > previousScore) return "up";
  if (latestScore < previousScore) return "down";
  return "flat";
}

/**
 * THESIS_CHECK's `recommendation` field is a zod enum built directly from
 * Prisma's own ThesisRecommendation enum object (see src/lib/ai/schemas.ts),
 * so the AI output and the database column can never fall out of sync — this
 * function is the one explicit place that fact is asserted and tested,
 * rather than relying on an implicit structural match at the call site.
 */
export function mapRecommendationToPrisma(
  recommendation: ThesisCheckOutput["recommendation"],
): ThesisRecommendation {
  return recommendation;
}

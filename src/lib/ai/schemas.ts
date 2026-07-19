// Zod v4 schemas (+ their matching JSON Schema, derived from the same zod
// schema with z.toJSONSchema so the two can never drift apart) for every
// AiAnalysisType. Phase 3 adds STOCK_SCORE and HEALTH_SCORE; later phases
// add COMMITTEE, THESIS_CHECK, BUY_ANALYSIS, SELL_ANALYSIS, WEEKLY_REVIEW,
// NEWS_SUMMARY here in the same file.

import { z } from "zod";

const scoreSchema = z.number().int().min(0).max(100);

const subscoresSchema = z.object({
  diversification: scoreSchema,
  valuation: scoreSchema,
  quality: scoreSchema,
  concentration: scoreSchema,
  dividendQuality: scoreSchema,
  risk: scoreSchema,
  cash: scoreSchema,
});

/** The recurring "point + evidence + reasoning" shape (renders via EvidenceList). */
const recommendationSchema = z.object({
  recommendation: z.string().min(1),
  evidence: z.array(z.string().min(1)),
  reasoning: z.string().min(1),
});

/**
 * The shared 0-100 score + 7-subscore + strengths + recommendations shape
 * (ui-spec-phases-2-6.md §4.2 "Health Score panel"). HEALTH_SCORE and
 * STOCK_SCORE intentionally use this SAME shape — the same seven dimensions
 * (diversification, valuation, quality, concentration, dividend quality,
 * risk, cash) apply whether the subject is the whole portfolio (HEALTH_SCORE,
 * Dashboard/Portfolio) or one instrument (STOCK_SCORE, /stocks/[id]); e.g.
 * "concentration" reads as top-holding/sector concentration at the
 * portfolio level and as customer/revenue concentration at the stock level.
 * BUILD-PLAN.md keeps them as two separate AiAnalysisType values because
 * they are separate persisted analyses (different subjectType/subjectId),
 * not because the output shape differs.
 */
function buildScorePanelSchema() {
  return z.object({
    score: scoreSchema,
    subscores: subscoresSchema,
    strengths: z.array(z.string().min(1)),
    recommendations: z.array(recommendationSchema),
  });
}

export const healthScoreSchema = buildScorePanelSchema();
export type HealthScoreOutput = z.infer<typeof healthScoreSchema>;
export const healthScoreJsonSchema = z.toJSONSchema(healthScoreSchema, {
  target: "draft-2020-12",
});

export const stockScoreSchema = buildScorePanelSchema();
export type StockScoreOutput = z.infer<typeof stockScoreSchema>;
export const stockScoreJsonSchema = z.toJSONSchema(stockScoreSchema, {
  target: "draft-2020-12",
});

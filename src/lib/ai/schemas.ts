// Zod v4 schemas (+ their matching JSON Schema, derived from the same zod
// schema with z.toJSONSchema so the two can never drift apart) for every
// AiAnalysisType. Phase 3 adds STOCK_SCORE and HEALTH_SCORE; Phase 4 adds
// THESIS_CHECK; later phases add COMMITTEE, BUY_ANALYSIS, SELL_ANALYSIS,
// WEEKLY_REVIEW, NEWS_SUMMARY here in the same file.

import { ThesisRecommendation } from "@prisma/client";
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

/**
 * THESIS_CHECK (ui-spec-phases-2-6.md §5.2 "Latest Check panel", BUILD-PLAN.md
 * Phase 4): re-examines an investor's own thesis statement against the
 * instrument's current data. `recommendation` uses Prisma's own
 * ThesisRecommendation enum object directly (the same pattern
 * transaction-schema.ts and instruments.ts use for Currency/Market/
 * InstrumentType) so the zod schema can never drift from the three values
 * ThesisCheck.recommendation actually accepts in the database.
 */
export const thesisCheckSchema = z.object({
  integrityScore: scoreSchema,
  recommendation: z.enum(ThesisRecommendation),
  evidence: z.object({
    // Still backs the original thesis.
    supporting: z.array(z.string().min(1)),
    // Undermines the original thesis.
    weakening: z.array(z.string().min(1)),
    // New positive evidence not mentioned in the original statement.
    improving: z.array(z.string().min(1)),
  }),
  watchItems: z.array(z.string().min(1)),
  summary: z.string().min(1),
});
export type ThesisCheckOutput = z.infer<typeof thesisCheckSchema>;
export const thesisCheckJsonSchema = z.toJSONSchema(thesisCheckSchema, {
  target: "draft-2020-12",
});

// ---------------------------------------------------------------------------
// COMMITTEE (ui-spec-phases-2-6.md §6.2, BUILD-PLAN.md Phase 5)
// ---------------------------------------------------------------------------

/** The six fixed persona lenses every committee run casts one vote from. */
export const COMMITTEE_PERSONAS = [
  "value",
  "growth",
  "dividend",
  "quality",
  "macro",
  "contrarian",
] as const;
export type CommitteePersona = (typeof COMMITTEE_PERSONAS)[number];

const committeeRecommendationSchema = z.enum(["BUY", "HOLD", "SELL"]);

/**
 * What ONE persona call returns (src/lib/ai/committee.ts makes six of these
 * in parallel). The consensus score/verdict is deliberately NOT part of this
 * shape — it is never asked of the model, only computed afterward by the
 * pure src/lib/ai/consensus.ts function from these six votes.
 */
export const personaVoteSchema = z.object({
  recommendation: committeeRecommendationSchema,
  confidence: scoreSchema,
  reasoning: z.string().min(1),
  evidence: z.array(z.string().min(1)),
  risks: z.array(z.string().min(1)),
  counterarguments: z.array(z.string().min(1)),
});
export type PersonaVoteOutput = z.infer<typeof personaVoteSchema>;
export const personaVoteJsonSchema = z.toJSONSchema(personaVoteSchema, {
  target: "draft-2020-12",
});

/** A persisted vote is the persona's own output plus which persona cast it. */
export const committeeVoteSchema = personaVoteSchema.extend({
  persona: z.enum(COMMITTEE_PERSONAS),
});
export type CommitteeVoteOutput = z.infer<typeof committeeVoteSchema>;

/**
 * What the ONE synthesis call returns — the prose parts only. `verdict` and
 * `consensusScore` are NOT requested here either; they are computed purely
 * from the six votes before this call is even made, and are only handed TO
 * the model (as context to explain, never to redecide).
 *
 * `thesisAssessment` is `nullable()` rather than `.optional()` so every
 * synthesis response has the same fixed set of keys regardless of whether a
 * thesis was attached — the model is told explicitly to write `null` when
 * there is no thesis to assess, and the UI (ui-spec §6.2) then omits the
 * "Thesis Assessment" section entirely, rather than showing it empty, when
 * the value is null.
 */
export const committeeSynthesisSchema = z.object({
  // A short bullet list of the real disagreements between the personas. When
  // the committee was genuinely unanimous, this still isn't empty — the
  // model is instructed to say so explicitly as its one item, so the
  // "Where the committee disagreed" panel (never collapsed, per ui-spec
  // §6.2) always has something honest to show.
  disagreements: z.array(z.string().min(1)).min(1),
  wouldChangeVerdict: z.array(z.string().min(1)),
  thesisAssessment: z.string().min(1).nullable(),
});
export type CommitteeSynthesisOutput = z.infer<typeof committeeSynthesisSchema>;
export const committeeSynthesisJsonSchema = z.toJSONSchema(committeeSynthesisSchema, {
  target: "draft-2020-12",
});

/**
 * The full shape persisted as AiAnalysis(COMMITTEE).output — assembled by
 * src/lib/ai/committee.ts from the six votes + the pure consensus score +
 * the synthesis call's prose, and re-validated with THIS schema before
 * persisting (same "never store something the UI doesn't expect" discipline
 * runAnalysis's own persist step uses) and again whenever a stored row is
 * read back (e.g. the /committee page, the read-only history page).
 */
export const committeeOutputSchema = z.object({
  verdict: committeeRecommendationSchema,
  consensusScore: scoreSchema,
  votes: z.array(committeeVoteSchema),
  disagreements: z.array(z.string().min(1)),
  wouldChangeVerdict: z.array(z.string().min(1)),
  thesisAssessment: z.string().min(1).nullable(),
});
export type CommitteeOutput = z.infer<typeof committeeOutputSchema>;

// ---------------------------------------------------------------------------
// BUY_ANALYSIS / SELL_ANALYSIS (ui-spec-phases-2-6.md §6.3-6.4, BUILD-PLAN.md Phase 5)
// ---------------------------------------------------------------------------

export const buyAnalysisSchema = z.object({
  score: scoreSchema,
  fairValueEstimate: z.object({
    value: z.number(),
    // Plain-English assumptions string, shown verbatim under Fair Value
    // (ui-spec §6.3), e.g. "DCF with 8% discount rate, 3% terminal growth".
    assumptions: z.array(z.string().min(1)),
  }),
  marginOfSafetyPct: z.number(),
  upsidePct: z.number(),
  downsidePct: z.number(),
  suggestedAllocationPct: z.number().min(0).max(100),
  confidence: scoreSchema,
  alternatives: z.array(
    z.object({ ticker: z.string().min(1), why: z.string().min(1) }),
  ),
});
export type BuyAnalysisOutput = z.infer<typeof buyAnalysisSchema>;
export const buyAnalysisJsonSchema = z.toJSONSchema(buyAnalysisSchema, {
  target: "draft-2020-12",
});

/**
 * The "point + evidence" shape EvidenceList renders (ui-spec §6.4: each
 * reason/counterargument is the point, its evidence renders as nested
 * "Evidence: …" lines) — the same shape schemas.ts's `recommendationSchema`
 * already established for Health/Stock Score, reused here under Sell
 * Analysis's own field names rather than duplicated.
 */
const sellAnalysisPointSchema = z.object({
  point: z.string().min(1),
  evidence: z.array(z.string().min(1)),
});

export const sellAnalysisSchema = z.object({
  sellScore: scoreSchema,
  reasons: z.array(sellAnalysisPointSchema),
  counterarguments: z.array(sellAnalysisPointSchema),
  confidence: scoreSchema,
});
export type SellAnalysisOutput = z.infer<typeof sellAnalysisSchema>;
export const sellAnalysisJsonSchema = z.toJSONSchema(sellAnalysisSchema, {
  target: "draft-2020-12",
});

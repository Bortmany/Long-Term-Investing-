// Zod schemas for structured AI output — one exported schema (+ inferred
// type) per AiAnalysisType. Add new types by adding a new export here, not by
// editing a giant switch; runAnalysis is generic over whichever schema the
// caller passes in.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared "scored analysis" shape — HEALTH_SCORE and STOCK_SCORE both score a
// subject 0-100 across the same seven lenses and both surface strengths +
// evidence-backed recommendations. Factored out here so the two schemas
// don't duplicate the shape verbatim, while remaining two distinct exports
// (they are two distinct AiAnalysisType rows in the database).
// ---------------------------------------------------------------------------

const subscore = z
  .number()
  .min(0)
  .max(100)
  .describe("0-100, higher is better");

const subscoresSchema = z.object({
  diversification: subscore,
  valuation: subscore,
  quality: subscore,
  concentration: subscore,
  dividendQuality: subscore,
  risk: subscore,
  cash: subscore,
});

/** A single "point + optional supporting evidence" entry (EvidenceList's shape). */
export const evidencedPointSchema = z.object({
  point: z.string(),
  evidence: z.array(z.string()).optional(),
});

function scoredAnalysisSchema() {
  return z.object({
    score: z.number().min(0).max(100).describe("Overall score, 0-100"),
    subscores: subscoresSchema,
    strengths: z.array(z.string()),
    recommendations: z.array(evidencedPointSchema),
  });
}

// ---------------------------------------------------------------------------
// One export per AiAnalysisType
// ---------------------------------------------------------------------------

/** AiAnalysisType.HEALTH_SCORE — the whole portfolio's health. */
export const healthScoreSchema = scoredAnalysisSchema();
export type HealthScoreOutput = z.infer<typeof healthScoreSchema>;

/** AiAnalysisType.STOCK_SCORE — one instrument's investment score. */
export const stockScoreSchema = scoredAnalysisSchema();
export type StockScoreOutput = z.infer<typeof stockScoreSchema>;

// Later phases add their schemas below, alongside these, e.g.:
//   export const committeeSchema = z.object({ ... });
// each exported independently — never folded into a shared switch.

/** AiAnalysisType.THESIS_CHECK — is a held/watched thesis still holding up? */
export const thesisCheckSchema = z.object({
  integrityScore: z.number().min(0).max(100).describe("0-100, higher = thesis more intact"),
  recommendation: z.enum(["INTACT", "WEAKENING", "BROKEN"]),
  evidence: z.object({
    supporting: z.array(z.string()),
    weakening: z.array(z.string()),
    improving: z.array(z.string()),
  }),
  watchItems: z.array(z.string()),
  summary: z.string(),
});
export type ThesisCheckOutput = z.infer<typeof thesisCheckSchema>;

// ---------------------------------------------------------------------------
// AiAnalysisType.COMMITTEE — six persona analyses + a synthesis, with the
// verdict/consensusScore computed deterministically server-side (see
// src/lib/ai/consensus.ts) rather than asked of any single model call.
// ---------------------------------------------------------------------------

/** One persona's independent take (value/growth/dividend/quality/macro/contrarian). */
export const personaOutputSchema = z.object({
  recommendation: z.enum(["BUY", "HOLD", "SELL"]),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  evidence: z.array(z.string()),
  risks: z.array(z.string()),
  counterarguments: z.array(z.string()),
});
export type PersonaOutput = z.infer<typeof personaOutputSchema>;

/** The committee's fixed six-persona roster. */
export const COMMITTEE_PERSONAS = [
  "value",
  "growth",
  "dividend",
  "quality",
  "macro",
  "contrarian",
] as const;
export type CommitteePersona = (typeof COMMITTEE_PERSONAS)[number];

/**
 * The one model call that synthesizes across the six persona outputs. Note:
 * deliberately has NO `verdict` and NO `consensusScore` — those are never
 * asked of the model, they are computed purely from the persona votes (see
 * computeConsensusScore / verdictForConsensusScore in ./consensus).
 */
export const committeeSynthesisSchema = z.object({
  disagreements: z.array(z.string()),
  wouldChangeVerdict: z.array(z.string()),
  thesisAssessment: z.string().optional(),
});
export type CommitteeSynthesisOutput = z.infer<typeof committeeSynthesisSchema>;

/**
 * The full shape persisted in one AiAnalysis(COMMITTEE) row — assembled
 * server-side from the 6 persona calls + the synthesis call + the computed
 * verdict/score. Never itself sent to any single model call.
 */
export const committeeSchema = z.object({
  verdict: z.enum(["BUY", "HOLD", "SELL"]),
  consensusScore: z.number().min(0).max(100),
  personas: z.object({
    value: personaOutputSchema,
    growth: personaOutputSchema,
    dividend: personaOutputSchema,
    quality: personaOutputSchema,
    macro: personaOutputSchema,
    contrarian: personaOutputSchema,
  }),
  disagreements: z.array(z.string()),
  wouldChangeVerdict: z.array(z.string()),
  thesisAssessment: z.string().optional(),
});
export type CommitteeOutput = z.infer<typeof committeeSchema>;

// ---------------------------------------------------------------------------
// AiAnalysisType.BUY_ANALYSIS — one instrument, evaluated as a potential buy
// under the investor's own stated assumptions (intended price/horizon/risk).
// ---------------------------------------------------------------------------

export const buyAnalysisSchema = z.object({
  score: z.number().min(0).max(100),
  fairValueEstimate: z.object({
    value: z.number(),
    assumptions: z.array(z.string()),
  }),
  marginOfSafety: z.number(),
  upside: z.number(),
  downside: z.number(),
  suggestedAllocationPct: z.number(),
  confidence: z.number().min(0).max(100),
  alternatives: z.array(z.object({ ticker: z.string(), why: z.string() })),
});
export type BuyAnalysisOutput = z.infer<typeof buyAnalysisSchema>;

// ---------------------------------------------------------------------------
// AiAnalysisType.SELL_ANALYSIS — one held instrument, evaluated for whether
// to sell. `reasons` and `counterarguments` each carry their own nested
// evidence (the EvidenceList shape), matching the UI spec's layout.
// ---------------------------------------------------------------------------

export const sellAnalysisSchema = z.object({
  sellScore: z.number().min(0).max(100),
  reasons: z.array(evidencedPointSchema),
  counterarguments: z.array(evidencedPointSchema),
  confidence: z.number().min(0).max(100),
});
export type SellAnalysisOutput = z.infer<typeof sellAnalysisSchema>;

// ---------------------------------------------------------------------------
// AiAnalysisType.WEEKLY_REVIEW — one week's portfolio review: what changed,
// new risks, drift from target allocation, and suggested actions.
// ---------------------------------------------------------------------------

export const weeklyReviewSchema = z.object({
  summary: z.string(),
  newRisks: z.array(z.string()),
  improvedHoldings: z.array(z.object({ ticker: z.string(), reason: z.string() })),
  weakenedHoldings: z.array(z.object({ ticker: z.string(), reason: z.string() })),
  allocationDrift: z.array(z.object({
    category: z.string(),
    targetPercent: z.number(),
    actualPercent: z.number(),
    drift: z.number(),
  })),
  suggestedActions: z.array(z.string()),
  behavioralNote: z.string(),
});
export type WeeklyReviewOutput = z.infer<typeof weeklyReviewSchema>;

// ---------------------------------------------------------------------------
// AiAnalysisType.NEWS_SUMMARY — a Haiku summary of recent news for one
// instrument, with an optional read on how it bears on a held thesis.
// ---------------------------------------------------------------------------

export const newsSummarySchema = z.object({
  whatHappened: z.string(),
  whyItMatters: z.string(),
  thesisImpact: z.string().optional(),
  shouldInvestorCare: z.string(),
  quotes: z.array(z.object({ text: z.string(), source: z.string().optional() })),
});
export type NewsSummaryOutput = z.infer<typeof newsSummarySchema>;

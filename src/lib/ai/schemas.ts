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
const evidencedPointSchema = z.object({
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

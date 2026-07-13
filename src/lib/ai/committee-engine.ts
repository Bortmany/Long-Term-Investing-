// The Investment Committee's fan-out orchestration (Phase 5).
//
// Same rule as runAnalysis (src/lib/ai/analysis.ts) — this is called ONLY
// from a server action triggered by an explicit "Convene Committee" click,
// never from a page's render path. Pages only read the persisted
// AiAnalysis(COMMITTEE) row.
//
// Behavior, in order:
//   1. Hash the shared input (same stable-stringify + SHA-256 as runAnalysis,
//      reusing its exported hashInput so hashes are identical across the two
//      engines rather than duplicating the logic).
//   2. Look for an existing AiAnalysis row with {COMMITTEE, instrument,
//      inputHash}. If found, reuse it — **zero API calls** — after
//      re-validating its stored output against committeeSchema.
//   3. No match + no ANTHROPIC_API_KEY -> typed unavailable result, nothing
//      persisted, nothing called.
//   4. No match + key present -> fan out 6 persona calls in parallel, then
//      one synthesis call. ANY failure anywhere in this fan-out (a thrown
//      error from any of the 7 calls, or any of the 7 outputs failing its
//      schema) returns a typed failure and persists NOTHING — there is no
//      code path where some persona calls succeed, some fail, and a partial
//      row still gets written.
//   5. Compute the verdict/consensusScore deterministically from the six
//      persona votes (src/lib/ai/consensus.ts) — never asked of the model.
//   6. Assemble the full CommitteeOutput, validate it once more (defense in
//      depth), then persist exactly one AiAnalysis(COMMITTEE) row.

import type { AiAnalysisType } from "@prisma/client";

import { unavailable, type DataResult } from "@/lib/data/provider";
import {
  createPrismaAiAnalysisStore,
  hashInput,
  type AiAnalysisStore,
} from "./analysis";
import { createAiClient, type AiClient } from "./client";
import { computeConsensusScore, verdictForConsensusScore } from "./consensus";
import { ANALYST_PREAMBLE, COMMITTEE_PERSONA_PROMPTS, COMMITTEE_SYNTHESIS_PROMPT } from "./prompts";
import {
  committeeSchema,
  committeeSynthesisSchema,
  personaOutputSchema,
  COMMITTEE_PERSONAS,
  type CommitteeOutput,
} from "./schemas";

const MAX_TOKENS = 4096;
const COMMITTEE_TYPE: AiAnalysisType = "COMMITTEE";

export type CommitteeEngineParams = {
  /** The signed-in user this committee run belongs to (from the server session). */
  userId: string;
  /** The instrumentId this committee is about. */
  subjectId: string;
  model: string;
  /**
   * The FULL shared payload (instrument+profile+quote+statements+dividends+
   * thesis+position) — identical object sent to all 7 model calls (only the
   * persona-specific system text differs, not the user content).
   */
  input: unknown;
  dataAsOf: Date;
  /** Injectable for tests — never touches the network or ANTHROPIC_API_KEY. */
  client?: AiClient;
  /** Injectable for tests — never touches the database. */
  store?: AiAnalysisStore;
};

export type CommitteeEngineResult = {
  output: CommitteeOutput;
  model: string;
  dataAsOf: Date;
  createdAt: Date;
  /** True when this result came from a stored row — zero API calls were made. */
  reused: boolean;
};

export async function runCommittee(
  params: CommitteeEngineParams,
): Promise<DataResult<CommitteeEngineResult>> {
  const { userId, subjectId, model, input, dataAsOf } = params;
  const store = params.store ?? createPrismaAiAnalysisStore();

  const inputHash = hashInput(input);

  // Reuse: an identical shared input for this user+instrument has already been
  // analyzed. Never call the API again for the same question, and never reuse
  // another user's run (whose input folds in their private thesis/position).
  const existing = await store.findLatest({
    userId,
    type: COMMITTEE_TYPE,
    subjectType: "instrument",
    subjectId,
    inputHash,
  });
  if (existing) {
    const revalidated = committeeSchema.safeParse(existing.output);
    if (!revalidated.success) {
      return unavailable(
        "no_data",
        "The stored analysis no longer matches the expected shape.",
      );
    }
    return {
      ok: true,
      data: {
        output: revalidated.data,
        model: existing.model,
        dataAsOf: existing.dataAsOf,
        createdAt: existing.createdAt,
        reused: true,
      },
    };
  }

  // No stored match — this is a fresh generation, gated on having a key.
  let client: AiClient;
  if (params.client) {
    client = params.client;
  } else {
    const clientResult = createAiClient();
    if (!clientResult.ok) {
      return clientResult;
    }
    client = clientResult.data;
  }

  // The shared cached system block every one of the 7 calls sends alongside
  // its own persona/synthesis instructions.
  const preambleBlock = {
    type: "text" as const,
    text: ANALYST_PREAMBLE,
    cache_control: { type: "ephemeral" as const },
  };

  let committeeOutput: CommitteeOutput;
  try {
    // Fan out the 6 persona calls in parallel.
    const personaResponses = await Promise.all(
      COMMITTEE_PERSONAS.map((persona) =>
        client.messages.parse({
          model,
          max_tokens: MAX_TOKENS,
          system: [preambleBlock, { type: "text", text: COMMITTEE_PERSONA_PROMPTS[persona] }],
          messages: [{ role: "user", content: JSON.stringify(input) }],
          schema: personaOutputSchema,
        }),
      ),
    );

    // Validate each persona output against its schema before doing anything
    // else with it — one bad output must abort the whole run, nothing
    // persisted (still inside this same try, before any store.create call).
    const personas = personaResponses.map((response) => {
      const validated = personaOutputSchema.safeParse(response.parsed_output);
      if (!validated.success) {
        throw new Error("persona output failed schema validation");
      }
      return validated.data;
    });

    const [valuePersona, growthPersona, dividendPersona, qualityPersona, macroPersona, contrarianPersona] =
      personas;

    const consensusScore = computeConsensusScore(
      personas.map((persona) => ({
        recommendation: persona.recommendation,
        confidence: persona.confidence,
      })),
    );
    const verdict = verdictForConsensusScore(consensusScore);

    // The 7th call: synthesis, handed the persona outputs plus the
    // already-computed verdict/score (which it must not recompute).
    const synthesisResponse = await client.messages.parse({
      model,
      max_tokens: MAX_TOKENS,
      system: [preambleBlock, { type: "text", text: COMMITTEE_SYNTHESIS_PROMPT }],
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            ...(input as object),
            personaOutputs: personas,
            consensusScore,
            verdict,
          }),
        },
      ],
      schema: committeeSynthesisSchema,
    });
    const validatedSynthesis = committeeSynthesisSchema.safeParse(
      synthesisResponse.parsed_output,
    );
    if (!validatedSynthesis.success) {
      throw new Error("synthesis output failed schema validation");
    }
    const synthesis = validatedSynthesis.data;

    const assembled = {
      verdict,
      consensusScore,
      personas: {
        value: valuePersona,
        growth: growthPersona,
        dividend: dividendPersona,
        quality: qualityPersona,
        macro: macroPersona,
        contrarian: contrarianPersona,
      },
      disagreements: synthesis.disagreements,
      wouldChangeVerdict: synthesis.wouldChangeVerdict,
      thesisAssessment: synthesis.thesisAssessment,
    };

    const validatedCommittee = committeeSchema.safeParse(assembled);
    if (!validatedCommittee.success) {
      throw new Error("assembled committee output failed schema validation");
    }
    committeeOutput = validatedCommittee.data;
  } catch {
    // Never surface the raw error (it could carry request details); this
    // also guarantees the no-partial-write property — any throw anywhere in
    // the 7-call fan-out lands here, before the single store.create below.
    return unavailable("provider_error", "The AI request failed.");
  }

  const created = await store.create({
    userId,
    type: COMMITTEE_TYPE,
    subjectType: "instrument",
    subjectId,
    model,
    inputHash,
    output: committeeOutput,
    dataAsOf,
  });

  return {
    ok: true,
    data: {
      output: committeeOutput,
      model: created.model,
      dataAsOf: created.dataAsOf,
      createdAt: created.createdAt,
      reused: false,
    },
  };
}

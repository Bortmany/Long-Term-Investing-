// The Investment Committee engine (BUILD-PLAN.md Phase 5). Unlike every
// other AiAnalysisType, a COMMITTEE run makes SEVEN model calls (six persona
// votes in parallel + one synthesis call) but persists exactly ONE AiAnalysis
// row — so it can't just call src/lib/ai/analysis.ts's runAnalysis() (built
// for exactly one call per analysis). Instead this file re-implements
// runAnalysis's OUTER shape (reuse-by-hash → key check → spend-cap check →
// call → validate → persist) by hand, while importing rather than
// duplicating every piece that IS shared: getAiClient, checkAiSpendCap, the
// ANALYST_SYSTEM_PREAMBLE, computeInputHash/stableStringify, and the default
// AiAnalysisStore.
//
// THE AI RULE (docs/CONVENTIONS.md) still applies in full: this function
// only ever runs from an explicit "Convene Committee" click (the caller,
// src/app/actions/committee.ts, is the only place that invokes it); a stored
// row with a matching input hash is reused with zero model calls and zero
// spend-cap charge.

import type { AiAnalysis, Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import {
  ANALYST_SYSTEM_PREAMBLE,
  COMMITTEE_PERSONA_INSTRUCTIONS,
  COMMITTEE_SYNTHESIS_INSTRUCTIONS,
} from "@/lib/ai/prompts";
import { checkAiSpendCap, type SpendCapDeps, type SpendCapResult } from "@/lib/ai/spend-cap";
import { getAiClient, type AiClientResult, type AiMessagesClient } from "@/lib/ai/client";
import {
  computeInputHash,
  defaultStore,
  stableStringify,
  type AiAnalysisStore,
  type RunAnalysisUnavailableReason,
} from "@/lib/ai/analysis";
import { computeConsensus } from "@/lib/ai/consensus";
import {
  COMMITTEE_PERSONAS,
  committeeOutputSchema,
  committeeSynthesisJsonSchema,
  committeeSynthesisSchema,
  personaVoteJsonSchema,
  personaVoteSchema,
  type CommitteeOutput,
  type CommitteePersona,
  type CommitteeVoteOutput,
  type PersonaVoteOutput,
} from "@/lib/ai/schemas";

const MAX_OUTPUT_TOKENS = 4096;

const NO_KEY_MESSAGE =
  "AI features are turned off (no ANTHROPIC_API_KEY configured). Nothing here was faked.";
const PROVIDER_ERROR_MESSAGE =
  "Something went wrong convening the committee. Your previous committee run (if any) is unaffected.";

export type RunCommitteeParams = {
  userId: string;
  instrumentId: string;
  model: string;
  /**
   * Produce the ONE shared input snapshot every persona and the synthesis
   * call see — real market data via the src/lib/data barrel, with any gap
   * honestly listed rather than guessed (the same discipline
   * buildThesisCheckInput/buildStockScoreInput use). Lives in the caller
   * (src/app/actions/committee.ts), not here, exactly like runAnalysis's own
   * `buildInput` param — this keeps the engine itself easy to unit-test with
   * a trivial fixture instead of a mocked data layer.
   */
  buildInput: () => Promise<{ input: unknown; dataAsOf: Date }>;
  now?: Date;
};

export type RunCommitteeResult =
  | { ok: true; data: CommitteeOutput; analysis: AiAnalysis }
  | { ok: false; unavailable: RunAnalysisUnavailableReason; message: string };

export type RunCommitteeDeps = {
  store?: AiAnalysisStore;
  getClient?: (apiKey?: string) => AiClientResult;
  checkSpendCap?: (
    userId: string,
    deps?: SpendCapDeps,
    now?: Date,
  ) => Promise<SpendCapResult>;
};

/** Pull the text block out of a Messages API response, or null if there isn't one. */
function textFromResponse(content: { type: string; text?: string }[]): string | null {
  const block = content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  return block?.text ?? null;
}

/**
 * One persona's vote. Never throws — any failure (network error, non-JSON
 * response, schema mismatch) is logged and reported as `null` so the caller
 * can fail the WHOLE committee run rather than silently seating a persona
 * short.
 */
async function callPersona(
  client: AiMessagesClient,
  model: string,
  persona: CommitteePersona,
  snapshot: unknown,
): Promise<PersonaVoteOutput | null> {
  try {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      // Every one of the seven calls in a committee run shares this exact
      // system block, so prompt caching applies across the whole run, not
      // just across separate analyses.
      system: [
        {
          type: "text",
          text: ANALYST_SYSTEM_PREAMBLE,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: stableStringify({
            instructions: COMMITTEE_PERSONA_INSTRUCTIONS[persona],
            snapshot,
          }),
        },
      ],
      output_config: { format: { type: "json_schema", schema: personaVoteJsonSchema } },
    });

    const text = textFromResponse(response.content);
    if (!text) return null;
    const raw: unknown = JSON.parse(text);
    const parsed = personaVoteSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    logger.error("Committee persona call failed", {
      persona,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** The synthesis call's prose parts, or null on any failure (same discipline as callPersona). */
async function callSynthesis(
  client: AiMessagesClient,
  model: string,
  snapshot: unknown,
  votes: CommitteeVoteOutput[],
  consensus: { verdict: string; score: number },
  hasThesis: boolean,
) {
  try {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [
        {
          type: "text",
          text: ANALYST_SYSTEM_PREAMBLE,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: stableStringify({
            instructions: COMMITTEE_SYNTHESIS_INSTRUCTIONS,
            snapshot,
            votes,
            consensus: { verdict: consensus.verdict, consensusScore: consensus.score },
            thesisAttached: hasThesis,
          }),
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: committeeSynthesisJsonSchema },
      },
    });

    const text = textFromResponse(response.content);
    if (!text) return null;
    const raw: unknown = JSON.parse(text);
    const parsed = committeeSynthesisSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    logger.error("Committee synthesis call failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function runCommittee(
  params: RunCommitteeParams,
  deps: RunCommitteeDeps = {},
): Promise<RunCommitteeResult> {
  const store = deps.store ?? defaultStore;
  const resolveClient = deps.getClient ?? getAiClient;
  const spendCap = deps.checkSpendCap ?? checkAiSpendCap;
  const now = params.now ?? new Date();

  const { input, dataAsOf } = await params.buildInput();
  const inputHash = computeInputHash(input);

  // Reuse first: identical to runAnalysis's own reuse-by-hash rule — a
  // matching stored COMMITTEE analysis costs nothing at all.
  const existing = await store.findFirst({
    userId: params.userId,
    type: "COMMITTEE",
    subjectType: "instrument",
    subjectId: params.instrumentId,
    inputHash,
  });
  if (existing) {
    const reused = committeeOutputSchema.safeParse(existing.output);
    if (reused.success) {
      return { ok: true, data: reused.data, analysis: existing };
    }
    logger.warn("Stored COMMITTEE analysis no longer matches its schema; regenerating", {
      subjectId: params.instrumentId,
    });
  }

  const clientResult = resolveClient();
  if (!clientResult.ok) {
    return { ok: false, unavailable: "no_api_key", message: NO_KEY_MESSAGE };
  }

  // ONE persisted row = ONE unit against the daily cap, however many model
  // calls it takes under the hood (docs/CONVENTIONS.md AI rules) — checked
  // once here, before any of the seven calls, never per-call.
  const capResult = await spendCap(params.userId, undefined, now);
  if (!capResult.ok) {
    return { ok: false, unavailable: "spend_cap", message: capResult.message };
  }

  // SIX persona calls, in parallel.
  const personaResults = await Promise.all(
    COMMITTEE_PERSONAS.map((persona) =>
      callPersona(clientResult.client, params.model, persona, input),
    ),
  );

  if (personaResults.some((vote) => vote === null)) {
    // Never persist a committee that's a member short and quietly pretend it
    // was the full six — fail the whole run instead.
    logger.error(
      "Committee run failed: at least one persona did not return a usable vote",
      { subjectId: params.instrumentId },
    );
    return { ok: false, unavailable: "provider_error", message: PROVIDER_ERROR_MESSAGE };
  }
  const votes = personaResults as PersonaVoteOutput[];
  const taggedVotes: CommitteeVoteOutput[] = COMMITTEE_PERSONAS.map((persona, index) => ({
    persona,
    ...votes[index],
  }));

  // The consensus score/verdict is computed HERE, purely, from the six
  // votes — never asked of the model (src/lib/ai/consensus.ts).
  const consensus = computeConsensus(
    votes.map((vote) => ({ recommendation: vote.recommendation, confidence: vote.confidence })),
  );

  const hasThesis =
    typeof input === "object" && input !== null && "thesis" in input && Boolean(
      (input as { thesis?: unknown }).thesis,
    );

  const synthesis = await callSynthesis(
    clientResult.client,
    params.model,
    input,
    taggedVotes,
    consensus,
    hasThesis,
  );
  if (!synthesis) {
    return { ok: false, unavailable: "provider_error", message: PROVIDER_ERROR_MESSAGE };
  }

  const output: CommitteeOutput = {
    verdict: consensus.verdict,
    consensusScore: consensus.score,
    votes: taggedVotes,
    disagreements: synthesis.disagreements,
    wouldChangeVerdict: synthesis.wouldChangeVerdict,
    thesisAssessment: synthesis.thesisAssessment,
  };

  const parsedOutput = committeeOutputSchema.safeParse(output);
  if (!parsedOutput.success) {
    logger.error("Committee output failed schema validation after assembly", {
      subjectId: params.instrumentId,
    });
    return { ok: false, unavailable: "provider_error", message: PROVIDER_ERROR_MESSAGE };
  }

  const created = await store.create({
    userId: params.userId,
    type: "COMMITTEE",
    subjectType: "instrument",
    subjectId: params.instrumentId,
    model: params.model,
    inputHash,
    output: output as Prisma.InputJsonValue,
    dataAsOf,
  });

  return { ok: true, data: parsedOutput.data, analysis: created };
}

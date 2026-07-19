// The one AI analysis engine every AiAnalysisType runs through
// (BUILD-PLAN.md cross-cutting §1). THE AI RULE (docs/CONVENTIONS.md):
// output is persisted in AiAnalysis and never regenerated on page view —
// calling this function IS the explicit "generate" action; a page just
// reads the stored row back out.
//
// Flow: buildInput() → stable-stringify + SHA-256 → inputHash. A stored
// AiAnalysis with the same (userId, type, subjectType, subjectId, inputHash)
// is REUSED as-is — no API call, no spend-cap charge. Only a genuinely new
// input reaches the key check → spend-cap check → Anthropic call →
// zod-validated persist. Every failure is a typed result; callers never see
// a thrown exception or a fabricated number.

import { createHash } from "node:crypto";
import type { AiAnalysis, AiAnalysisType, Prisma } from "@prisma/client";
import { z, type ZodType } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ANALYST_SYSTEM_PREAMBLE } from "@/lib/ai/prompts";
import { checkAiSpendCap, type SpendCapDeps, type SpendCapResult } from "@/lib/ai/spend-cap";
import { getAiClient, type AiClientResult } from "@/lib/ai/client";

/** What kind of thing an analysis is about — matches AiAnalysis.subjectType. */
export type AiSubjectType = "instrument" | "thesis" | "portfolio";

export type BuildInputResult = { input: unknown; dataAsOf: Date };

export type RunAnalysisParams<T> = {
  userId: string;
  type: AiAnalysisType;
  subjectType: AiSubjectType;
  subjectId: string;
  model: string;
  /**
   * Produce the (JSON-serializable) input the AI sees and the date the
   * underlying data was as of. Called BEFORE any API/spend-cap check so a
   * hash-reuse hit never does the real work twice — but pure local
   * pre-computation (allocation %, HHI, ratios, etc.) is expected to be
   * cheap; if a caller's buildInput does real I/O, it still runs once per
   * call regardless of whether the result ends up reused.
   */
  buildInput: () => Promise<BuildInputResult>;
  schema: ZodType<T>;
  now?: Date;
};

export type RunAnalysisUnavailableReason =
  | "no_api_key"
  | "spend_cap"
  | "schema_mismatch"
  | "provider_error";

export type RunAnalysisResult<T> =
  | { ok: true; data: T; analysis: AiAnalysis }
  | { ok: false; unavailable: RunAnalysisUnavailableReason; message: string };

// --- Injectable seams (tests supply fakes; production uses the defaults) ---

export type AiAnalysisStore = {
  findFirst: (args: {
    userId: string;
    type: AiAnalysisType;
    subjectType: string;
    subjectId: string;
    inputHash: string;
  }) => Promise<AiAnalysis | null>;
  create: (data: {
    userId: string;
    type: AiAnalysisType;
    subjectType: string;
    subjectId: string;
    model: string;
    inputHash: string;
    output: Prisma.InputJsonValue;
    dataAsOf: Date;
  }) => Promise<AiAnalysis>;
};

// Exported so src/lib/ai/committee.ts (which persists its own AiAnalysis(COMMITTEE)
// row through a hand-rolled flow rather than this file's generic runAnalysis)
// can reuse the exact same default persistence — import, never duplicate.
export const defaultStore: AiAnalysisStore = {
  findFirst: ({ userId, type, subjectType, subjectId, inputHash }) =>
    prisma.aiAnalysis.findFirst({
      where: { userId, type, subjectType, subjectId, inputHash },
      // Reuse the newest match, in case more than one somehow shares a hash.
      orderBy: { createdAt: "desc" },
    }),
  create: (data) => prisma.aiAnalysis.create({ data }),
};

export type RunAnalysisDeps = {
  store?: AiAnalysisStore;
  getClient?: (apiKey?: string) => AiClientResult;
  checkSpendCap?: (
    userId: string,
    deps?: SpendCapDeps,
    now?: Date,
  ) => Promise<SpendCapResult>;
};

// --- Stable input hashing ----------------------------------------------------

/** Deep-sort object keys (and normalize Dates to ISO strings) for a hash that never depends on key order. */
function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** A stable JSON string for `value` — same input always produces the same string, regardless of key order. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** SHA-256 of the stable-stringified input — the change-detection key for reuse. */
export function computeInputHash(input: unknown): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

// --- Plain-English messages (never fabricate data; always say why) ---------

const NO_KEY_MESSAGE =
  "AI features are turned off (no ANTHROPIC_API_KEY configured). Nothing here was faked.";
const PROVIDER_ERROR_MESSAGE =
  "Something went wrong generating this analysis. Your previous analysis (if any) is unaffected.";
const SCHEMA_MISMATCH_MESSAGE =
  "The AI's response didn't match the expected shape, so nothing was saved. Your previous analysis (if any) is unaffected.";

const MAX_OUTPUT_TOKENS = 4096;

export async function runAnalysis<T>(
  params: RunAnalysisParams<T>,
  deps: RunAnalysisDeps = {},
): Promise<RunAnalysisResult<T>> {
  const store = deps.store ?? defaultStore;
  const resolveClient = deps.getClient ?? getAiClient;
  const spendCap = deps.checkSpendCap ?? checkAiSpendCap;
  const now = params.now ?? new Date();

  const { input, dataAsOf } = await params.buildInput();
  const inputHash = computeInputHash(input);

  // Reuse first: a matching stored analysis costs nothing — no key check,
  // no spend-cap charge, no API call.
  const existing = await store.findFirst({
    userId: params.userId,
    type: params.type,
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    inputHash,
  });
  if (existing) {
    const reused = params.schema.safeParse(existing.output);
    if (reused.success) {
      return { ok: true, data: reused.data, analysis: existing };
    }
    // Stored output no longer matches this type's current schema (e.g. the
    // schema shape changed since it was saved) — fall through and
    // regenerate rather than return data that doesn't fit what the UI now
    // expects.
    logger.warn("Stored AiAnalysis no longer matches its schema; regenerating", {
      type: params.type,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
    });
  }

  const clientResult = resolveClient();
  if (!clientResult.ok) {
    return { ok: false, unavailable: "no_api_key", message: NO_KEY_MESSAGE };
  }

  const capResult = await spendCap(params.userId, undefined, now);
  if (!capResult.ok) {
    return { ok: false, unavailable: "spend_cap", message: capResult.message };
  }

  const jsonSchema = z.toJSONSchema(params.schema, { target: "draft-2020-12" });

  let response;
  try {
    response = await clientResult.client.messages.create({
      model: params.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      // The shared analyst preamble is the one big, unchanging block, so it
      // is what gets the prompt-cache breakpoint — every analysis type and
      // every user shares this same cached prefix.
      system: [
        {
          type: "text",
          text: ANALYST_SYSTEM_PREAMBLE,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: stableStringify(input) }],
      output_config: { format: { type: "json_schema", schema: jsonSchema } },
    });
  } catch (error) {
    logger.error("AI analysis request failed", {
      type: params.type,
      subjectType: params.subjectType,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, unavailable: "provider_error", message: PROVIDER_ERROR_MESSAGE };
  }

  const textBlock = response.content.find((block) => block.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  if (!textBlock?.text) {
    logger.error("AI analysis response had no text content", {
      type: params.type,
      subjectType: params.subjectType,
    });
    return { ok: false, unavailable: "provider_error", message: PROVIDER_ERROR_MESSAGE };
  }

  let rawOutput: unknown;
  try {
    rawOutput = JSON.parse(textBlock.text);
  } catch {
    logger.error("AI analysis response was not valid JSON", {
      type: params.type,
      subjectType: params.subjectType,
    });
    return { ok: false, unavailable: "schema_mismatch", message: SCHEMA_MISMATCH_MESSAGE };
  }

  const parsed = params.schema.safeParse(rawOutput);
  if (!parsed.success) {
    logger.error("AI analysis response failed schema validation", {
      type: params.type,
      subjectType: params.subjectType,
    });
    return { ok: false, unavailable: "schema_mismatch", message: SCHEMA_MISMATCH_MESSAGE };
  }

  const created = await store.create({
    userId: params.userId,
    type: params.type,
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    model: params.model,
    inputHash,
    output: rawOutput as Prisma.InputJsonValue,
    dataAsOf,
  });

  return { ok: true, data: parsed.data, analysis: created };
}

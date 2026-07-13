// The one AI engine every phase (3 through 6) reuses. One rule above all
// others:
//
//   `runAnalysis` must ONLY be called from a server action triggered by an
//   explicit user action (clicking "Generate" / "Re-analyze" / "Convene
//   Committee" / etc.) — NEVER from a page's render path or a Server
//   Component's data-fetching. Pages read the persisted AiAnalysis row (or
//   show "no analysis yet"); they never trigger a new generation just by
//   being viewed. Future builders reusing this engine: keep it that way.
//
// Behavior, in order:
//   1. buildInput() — caller-supplied, produces the exact payload the model
//      will see plus the "as of" date of the underlying data.
//   2. Stable-stringify (sorted object keys) + SHA-256 that payload into an
//      inputHash — the same input always hashes the same way regardless of
//      key order.
//   3. Look for an existing AiAnalysis row with the same
//      {type, subjectType, subjectId, inputHash}. If found, reuse it —
//      **zero API calls** — after re-validating its stored output against
//      the schema (defense in depth).
//   4. No match + no ANTHROPIC_API_KEY → typed unavailable result, nothing
//      persisted, nothing called.
//   5. No match + key present → call the model with structured output.
//   6. Validate the parsed output against the schema again (defense in
//      depth, even though the SDK already validated it). A failure here
//      returns a typed failure and persists nothing.
//   7. Success → persist a new AiAnalysis row and return it.

import { createHash } from "node:crypto";
import type { AiAnalysisType } from "@prisma/client";
import type { ZodType } from "zod";

import { unavailable, type DataResult } from "@/lib/data/provider";
import { prisma } from "@/lib/prisma";
import { createAiClient, type AiClient } from "./client";
import { ANALYST_PREAMBLE } from "./prompts";

const MAX_TOKENS = 4096;

// ---------------------------------------------------------------------------
// Storage port (injectable so unit tests need no database — same pattern as
// src/lib/data/market-data.ts's MarketDataCacheStore / FxRateStore).
// ---------------------------------------------------------------------------

export type StoredAiAnalysis = {
  model: string;
  output: unknown;
  dataAsOf: Date;
  createdAt: Date;
};

export interface AiAnalysisStore {
  findLatest(key: {
    type: AiAnalysisType;
    subjectType: string;
    subjectId: string;
    inputHash: string;
  }): Promise<StoredAiAnalysis | null>;
  create(row: {
    type: AiAnalysisType;
    subjectType: string;
    subjectId: string;
    model: string;
    inputHash: string;
    output: unknown;
    dataAsOf: Date;
  }): Promise<StoredAiAnalysis>;
}

export function createPrismaAiAnalysisStore(): AiAnalysisStore {
  return {
    async findLatest({ type, subjectType, subjectId, inputHash }) {
      const row = await prisma.aiAnalysis.findFirst({
        where: { type, subjectType, subjectId, inputHash },
        orderBy: { createdAt: "desc" },
      });
      if (!row) return null;
      return {
        model: row.model,
        output: row.output,
        dataAsOf: row.dataAsOf,
        createdAt: row.createdAt,
      };
    },
    async create({ type, subjectType, subjectId, model, inputHash, output, dataAsOf }) {
      const row = await prisma.aiAnalysis.create({
        data: {
          type,
          subjectType,
          subjectId,
          model,
          inputHash,
          output: output as object,
          dataAsOf,
        },
      });
      return {
        model: row.model,
        output: row.output,
        dataAsOf: row.dataAsOf,
        createdAt: row.createdAt,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Stable input hashing — object key order must never change the hash.
// ---------------------------------------------------------------------------

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => [key, sortKeysDeep(v)] as const);
    return Object.fromEntries(sortedEntries);
  }
  return value;
}

/** Stable JSON stringification (recursively sorted object keys). Exported for tests. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function hashInput(input: unknown): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

export type RunAnalysisParams<T> = {
  type: AiAnalysisType;
  /** What the analysis is about, e.g. "instrument" / "portfolio". */
  subjectType: string;
  subjectId: string;
  model: string;
  /** Builds the exact payload the model sees, plus the data's "as of" date. */
  buildInput: () => Promise<{ input: unknown; dataAsOf: Date }>;
  schema: ZodType<T>;
  /** Injectable for tests — never touches the network or ANTHROPIC_API_KEY. */
  client?: AiClient;
  /** Injectable for tests — never touches the database. */
  store?: AiAnalysisStore;
};

export type RunAnalysisResult<T> = {
  output: T;
  model: string;
  dataAsOf: Date;
  createdAt: Date;
  /** True when this result came from a stored row — zero API calls were made. */
  reused: boolean;
};

export async function runAnalysis<T>(
  params: RunAnalysisParams<T>,
): Promise<DataResult<RunAnalysisResult<T>>> {
  const { type, subjectType, subjectId, model, buildInput, schema } = params;
  const store = params.store ?? createPrismaAiAnalysisStore();

  const { input, dataAsOf } = await buildInput();
  const inputHash = hashInput(input);

  // Reuse: an identical input for this subject+type has already been
  // analyzed. Never call the API again for the same question.
  const existing = await store.findLatest({ type, subjectType, subjectId, inputHash });
  if (existing) {
    const revalidated = schema.safeParse(existing.output);
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

  let parsedOutput: unknown;
  try {
    const response = await client.messages.parse({
      model,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: ANALYST_PREAMBLE, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(input) }],
      schema,
    });
    parsedOutput = response.parsed_output;
  } catch {
    // Never surface the raw error (it could carry request details); the
    // typed failure is all the UI's "Analysis failed" state needs.
    return unavailable("provider_error", "The AI request failed.");
  }

  const validated = schema.safeParse(parsedOutput);
  if (!validated.success) {
    return unavailable(
      "provider_error",
      "The AI response did not match the expected shape.",
    );
  }

  const created = await store.create({
    type,
    subjectType,
    subjectId,
    model,
    inputHash,
    output: validated.data,
    dataAsOf,
  });

  return {
    ok: true,
    data: {
      output: validated.data,
      model: created.model,
      dataAsOf: created.dataAsOf,
      createdAt: created.createdAt,
      reused: false,
    },
  };
}

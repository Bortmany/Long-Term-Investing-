// The one seam between InvestIQ and the real Anthropic API.
//
// GOLDEN RULE for AI: a missing ANTHROPIC_API_KEY (or any failure to build a
// client) returns a typed "unavailable" result — it never throws and never
// hands back a fake/fabricated client. Callers (runAnalysis, pages) branch on
// that typed result instead of catching exceptions.
//
// Everything here is deliberately small so a unit test can substitute a fake
// object literal (`{ messages: { parse: async () => ({ parsed_output }) } }`)
// in place of the real SDK client — no network, no env vars, no Anthropic
// import needed on the test side.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodType } from "zod";

import { unavailable, type DataResult } from "@/lib/data/provider";

export const ANALYSIS_MODEL = "claude-sonnet-5";
export const FAST_MODEL = "claude-haiku-4-5";

/** One block of the (optionally prompt-cached) system preamble. */
export type AiSystemBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

export type AiMessageParams = {
  model: string;
  max_tokens: number;
  system?: string | AiSystemBlock[];
  messages: { role: "user"; content: string }[];
  /** The zod schema the structured output must satisfy. */
  schema: ZodType;
};

/**
 * The narrow seam `runAnalysis` talks to. Small on purpose: a test fake only
 * needs to implement `messages.parse` — nothing else about the real SDK
 * client leaks into calling code.
 */
export interface AiClient {
  messages: {
    parse(params: AiMessageParams): Promise<{ parsed_output: unknown }>;
  };
}

function wrapAnthropicClient(client: Anthropic): AiClient {
  return {
    messages: {
      async parse(params) {
        const message = await client.messages.parse({
          model: params.model,
          max_tokens: params.max_tokens,
          system: params.system,
          messages: params.messages,
          output_config: { format: zodOutputFormat(params.schema) },
        });
        return { parsed_output: message.parsed_output };
      },
    },
  };
}

/**
 * True when ANTHROPIC_API_KEY is set. Pages use this synchronously (no need
 * to build a client) to decide between showing ConnectKeyNotice and the real
 * "Generate"/"Re-analyze" trigger button.
 */
export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Build a real Anthropic client from ANTHROPIC_API_KEY. Never throws, never
 * fabricates a client, never logs the key: a missing key returns the typed
 * unavailable result instead.
 */
export function createAiClient(): DataResult<AiClient> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return unavailable("no_api_key");
  }
  return { ok: true, data: wrapAnthropicClient(new Anthropic({ apiKey })) };
}

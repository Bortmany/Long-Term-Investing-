// The Anthropic client wrapper (BUILD-PLAN.md cross-cutting §1).
//
// GOLDEN RULE for AI: a missing key is a first-class, honest state — never
// an exception, never a silent fallback to fake output. Callers get a typed
// { ok: false, unavailable: "no_api_key" } result and show ConnectKeyNotice.
//
// NEVER log or return the key itself — ANTHROPIC_API_KEY is read once here
// and handed straight to the SDK constructor; nothing about it is logged.

import Anthropic from "@anthropic-ai/sdk";

// The two models this app uses, named once so every caller stays in sync
// with BUILD-PLAN's decision. ANALYSIS_MODEL is the deep-reasoning model
// used for Health Score, Committee, Thesis Check, etc. FAST_MODEL is for
// cheap, high-volume work (Phase 6's per-holding news summaries).
export const ANALYSIS_MODEL = "claude-sonnet-5";
export const FAST_MODEL = "claude-haiku-4-5";

/**
 * The narrow slice of the Anthropic SDK this app actually calls. Typed
 * directly from the SDK's own request/response types so a real `Anthropic`
 * instance satisfies it structurally, but kept small enough that tests can
 * hand-write a fake client (no network, no SDK instantiation) that also
 * satisfies it.
 */
export interface AiMessagesClient {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
    ): Promise<Anthropic.Message>;
  };
}

export type AiClientResult =
  | { ok: true; client: AiMessagesClient }
  | { ok: false; unavailable: "no_api_key" };

/**
 * Build the Anthropic client from ANTHROPIC_API_KEY, or return the typed
 * "no key" result. Pass an explicit `apiKey` (e.g. in tests) to override the
 * environment; omit it to read `process.env.ANTHROPIC_API_KEY` as normal.
 */
export function getAiClient(
  apiKey: string | undefined = process.env.ANTHROPIC_API_KEY,
): AiClientResult {
  if (!apiKey) return { ok: false, unavailable: "no_api_key" };
  // Cast note: `Anthropic`'s `messages.create` is overloaded (streaming vs
  // non-streaming); AiMessagesClient only names the non-streaming signature
  // this app uses. The real method is present and behaves identically at
  // runtime — this narrows the TYPE for injectability, it changes nothing
  // about what actually runs.
  const client = new Anthropic({ apiKey }) as unknown as AiMessagesClient;
  return { ok: true, client };
}

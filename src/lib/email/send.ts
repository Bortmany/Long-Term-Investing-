// Dormant email module (BUILD-PLAN.md Phase 7) — sends through the Resend
// API (https://api.resend.com/emails) with plain `fetch`. No new npm
// dependency, matching the "no new dependency" discipline this app already
// applies to charts/primitives (docs/design/ui-spec-phases-2-6.md).
//
// GOLDEN RULE for this module: with no key configured, email is a
// first-class, honest "dormant" state — sendEmail returns the typed
// "unavailable" result WITHOUT ever touching the network, the same
// discipline src/lib/ai/client.ts uses for a missing ANTHROPIC_API_KEY.
//
// NEVER log or return RESEND_API_KEY, the response body, or the request URL
// — only the numeric HTTP status code is ever logged on failure, the same
// discipline src/lib/data/fmp.ts uses for FMP_API_KEY.

import { logger } from "@/lib/logger";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailUnavailableReason = "no_api_key" | "provider_error";

/** Same two-branch shape as the market-data layer's DataResult<T>, defined
 * locally here because this module isn't part of src/lib/data (that barrel
 * is reserved for market data per docs/CONVENTIONS.md). */
export type EmailResult<T> =
  | { ok: true; data: T }
  | { ok: false; unavailable: EmailUnavailableReason };

function unavailable(reason: EmailUnavailableReason): EmailResult<never> {
  return { ok: false, unavailable: reason };
}

/** True only when BOTH RESEND_API_KEY and RESEND_FROM are set and non-empty. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim()) && Boolean(process.env.RESEND_FROM?.trim());
}

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type SendEmailDeps = {
  /** Injectable for tests. Defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Injectable for tests. Defaults to process.env.RESEND_API_KEY. */
  apiKey?: string;
  /** Injectable for tests. Defaults to process.env.RESEND_FROM. */
  from?: string;
};

/**
 * Send one email through the Resend API. No key/from address configured →
 * the typed "unavailable" result without any network call. A non-2xx
 * response is also "unavailable" — only `response.status` is logged, never
 * the response body (which could echo request details) or the request URL.
 */
export async function sendEmail(
  input: SendEmailInput,
  deps: SendEmailDeps = {},
): Promise<EmailResult<{ id: string }>> {
  const apiKey = deps.apiKey ?? process.env.RESEND_API_KEY;
  const from = deps.from ?? process.env.RESEND_FROM;
  if (!apiKey || !from) {
    return unavailable("no_api_key");
  }

  const fetchFn = deps.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await fetchFn(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
  } catch {
    // Never include the caught error itself — it could echo the request
    // (Authorization header included) back into a log line.
    logger.warn("Email send failed: could not reach the Resend API");
    return unavailable("provider_error");
  }

  if (!response.ok) {
    logger.warn("Email send failed", { status: response.status });
    return unavailable("provider_error");
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    logger.warn("Email send failed: Resend returned an unreadable response");
    return unavailable("provider_error");
  }

  const id = (json as Record<string, unknown> | null)?.id;
  if (typeof id !== "string" || id.length === 0) {
    logger.warn("Email send failed: Resend response had no message id");
    return unavailable("provider_error");
  }

  return { ok: true, data: { id } };
}

/**
 * Escape the five HTML-significant characters. Every interpolated string
 * that lands inside an email's `html` body must be passed through this
 * first — see src/lib/email/weekly-brief.ts for the one caller today.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

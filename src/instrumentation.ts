// Server-side observability hooks (Next.js 16 instrumentation file).
//
// Sentry is DORMANT until SENTRY_DSN is set: with no DSN, register() returns
// immediately and the SDK is never imported or initialised. The structured
// logger always records unhandled server errors regardless, so we keep a
// record even when Sentry is off.

import type { Instrumentation } from "next";
import { logger } from "@/lib/logger";

const MIN_BETTER_AUTH_SECRET_LENGTH = 32;
const MIN_CRON_SECRET_LENGTH = 16;

/**
 * Refuse to start in production with a missing or weak auth secret
 * (engineering-standards.md §6: "production refuses default, short, or
 * missing secrets"). Never prints the secret's value — only its presence
 * and length are ever examined. Local/dev/test runs are unaffected so
 * `npm run dev` and the test suite keep working without a real secret.
 */
function checkStartupSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;

  const authSecret = process.env.BETTER_AUTH_SECRET;
  if (!authSecret || authSecret.length < MIN_BETTER_AUTH_SECRET_LENGTH) {
    throw new Error(
      "BETTER_AUTH_SECRET is missing or too short. Set it in the production " +
        `environment to a random value at least ${MIN_BETTER_AUTH_SECRET_LENGTH} ` +
        "characters long before starting the app — see .env.example for how to " +
        "generate one. This is required so signed-in sessions can't be forged.",
    );
  }

  // Rate-limit IP source: when the proxy headers aren't trusted, anonymous
  // callers are limited by a signed per-browser cookie instead of a real IP
  // (see src/lib/rate-limit.ts). That's the SAFE default, but if this app runs
  // behind a proxy you control (Railway, a load balancer) you probably want
  // TRUST_PROXY_HEADERS="true" so limits key on the real client IP. Say so
  // loudly once at startup so it's a deliberate choice, not an oversight.
  if (process.env.TRUST_PROXY_HEADERS !== "true") {
    logger.warn(
      "TRUST_PROXY_HEADERS is not \"true\": anonymous rate limiting keys on a " +
        "signed per-browser cookie, not the real client IP. This is the safe " +
        "default. If this app runs behind a proxy you control that sets " +
        "X-Forwarded-For, set TRUST_PROXY_HEADERS=\"true\" to limit by real IP.",
    );
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && cronSecret.length < MIN_CRON_SECRET_LENGTH) {
    // A weak CRON_SECRET only weakens an optional feature (scheduled
    // weekly reviews / alert sweeps), so this is a warning, not a startup
    // failure — the app still starts fine without scheduling turned on.
    logger.warn(
      "CRON_SECRET is set but shorter than recommended — the scheduled cron " +
        "endpoints are easier to guess than they should be.",
      { minLength: MIN_CRON_SECRET_LENGTH, actualLength: cronSecret.length },
    );
  }
}

export async function register(): Promise<void> {
  checkStartupSecrets();

  if (!process.env.SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
  } catch (err) {
    logger.error("Sentry failed to initialise", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Next calls this whenever the server catches an error. We always log it (with
// enough context to find it), then forward to Sentry when configured.
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest?: unknown }).digest)
      : undefined;

  logger.error("Unhandled server error", {
    message: err instanceof Error ? err.message : String(err),
    digest,
    path: request.path,
    method: request.method,
    routeType: context.routeType,
  });

  if (!process.env.SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(err, request, context);
  } catch {
    // Sentry unavailable — the logger.error above is our record.
  }
};

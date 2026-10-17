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
export function checkStartupSecrets(): void {
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

  // Rate-limit IP source: without TRUST_PROXY_HEADERS="true" the app cannot
  // see the real visitor address behind Railway's proxy, so the Stripe webhook
  // and the cron endpoints would share ONE rate-limit bucket with everyone —
  // junk requests could then block Stripe's real retries or the scheduler.
  // Refuse to start so this is a deliberate choice, never an oversight.
  if (process.env.TRUST_PROXY_HEADERS !== "true") {
    throw new Error(
      "TRUST_PROXY_HEADERS is not set to \"true\". In production the app sits " +
        "behind a proxy, and without this setting every visitor (including " +
        "Stripe's webhook and the cron scheduler) shares one rate limit, so junk " +
        "requests could block the real ones. Set TRUST_PROXY_HEADERS=\"true\" " +
        "in the production environment before starting the app.",
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

/**
 * ALLOW_SIGNUPS is retired: sign-ups are now open by default and
 * SIGNUPS_PAUSED="true" is the off-switch (src/lib/auth.ts). If an old
 * environment still sets ALLOW_SIGNUPS, say so once at startup so nobody
 * thinks it still does anything. Runs in every environment.
 */
function warnAboutRetiredSettings(env: Record<string, string | undefined> = process.env): void {
  // Next may call register() once per runtime; warn from the Node one only.
  if (env.NEXT_RUNTIME === "edge") return;
  if (env.ALLOW_SIGNUPS !== undefined) {
    logger.warn("ALLOW_SIGNUPS is no longer used; use SIGNUPS_PAUSED.");
  }
}

export async function register(): Promise<void> {
  checkStartupSecrets();
  warnAboutRetiredSettings();

  // Node.js-only: see instrumentation-node.ts for why this is a dynamic
  // import guarded by NEXT_RUNTIME rather than a top-level import here.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { subscribeSocketIpDiagnostics } = await import("./instrumentation-node");
    await subscribeSocketIpDiagnostics();
  }

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
  }, { alert: false }); // Sentry gets this one below, with the full request.

  if (!process.env.SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(err, request, context);
  } catch {
    // Sentry unavailable — the logger.error above is our record.
  }
};

// Server-side observability hooks (Next.js 16 instrumentation file).
//
// Sentry is DORMANT until SENTRY_DSN is set: with no DSN, register() returns
// immediately and the SDK is never imported or initialised. The structured
// logger always records unhandled server errors regardless, so we keep a
// record even when Sentry is off.

import type { Instrumentation } from "next";
import { logger } from "@/lib/logger";

export async function register(): Promise<void> {
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

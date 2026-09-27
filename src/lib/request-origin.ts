// Same-origin check for state-changing (POST) requests — a clean, early guard
// so a spoofed Origin header returns a plain 400 instead of crashing a server
// action deep in the framework with an unhandled 500 (which leaks a digest).
//
// This is defence-in-depth, not the primary CSRF defence: session cookies are
// SameSite=Lax, and Next.js already compares Origin to the host for server
// actions. We just want the mismatch handled tidily at the edge.

/**
 * True when the request may proceed on origin grounds:
 * - no Origin header (server-to-server calls, curl, health checks) → allowed;
 *   there is nothing to compare, and cookie SameSite still applies.
 * - Origin host matches the request host (x-forwarded-host, else host) → allowed.
 * Anything else (a present Origin whose host differs) → rejected.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return true;

  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    // A malformed Origin header can't be trusted.
    return false;
  }

  return originHost === host;
}

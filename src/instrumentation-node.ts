// Node.js-runtime-only instrumentation, split out of instrumentation.ts per
// Next.js's own guidance ("Importing runtime-specific code" in the
// instrumentation guide): instrumentation.ts is bundled for BOTH the Node.js
// and Edge runtimes, so a `node:` import written directly in that file gets
// flagged by the bundler even behind a runtime check. Keeping the Node-only
// code in its own file, imported with a dynamic `await import(...)` guarded
// by `NEXT_RUNTIME === "nodejs"`, keeps the Edge bundle clean.

import { SOCKET_IP_HEADER } from "@/lib/rate-limit";

// Guarded on globalThis so a dev hot-reload (which re-runs this module)
// never subscribes twice.
const globalForSocketIp = globalThis as typeof globalThis & {
  __investiqSocketIpSubscribed?: boolean;
};

type SocketIpDiagnosticsMessage = {
  request?: { headers?: Record<string, string | string[] | undefined> };
  socket?: { remoteAddress?: string };
};

/**
 * Pure body of the diagnostics-channel handler, split out so it's
 * unit-testable without a real HTTP server. Unconditionally OVERWRITES
 * SOCKET_IP_HEADER with the socket's real remote address — discarding any
 * value a caller sent under that header name — so route handlers can trust
 * it. Exported for tests only; runtime code should go through
 * subscribeSocketIpDiagnostics().
 */
export function stampSocketIpHeader(message: unknown): void {
  const { request, socket } = (message ?? {}) as SocketIpDiagnosticsMessage;
  if (!request?.headers) return;
  request.headers[SOCKET_IP_HEADER] = socket?.remoteAddress ?? "";
}

/**
 * Stamp the TRUE TCP socket address of every incoming request onto
 * SOCKET_IP_HEADER before Next.js — or any client-controlled code — ever
 * reads the request. This is what lets anonymousRateLimitId()
 * (src/lib/anon-rate-id.ts) key a cookie-less anonymous caller on a real,
 * unspoofable per-source identity instead of a shared bucket (a platform-
 * wide DoS) or a fresh bucket every single request (unthrottled).
 *
 * Uses Node's `diagnostics_channel`, which fires at the raw `http.Server`
 * level — the exact same request object Next.js later reads `.headers`
 * from — so this always wins over anything a caller sent under the same
 * header name (a plain assignment fully replaces it, never appends).
 */
export async function subscribeSocketIpDiagnostics(): Promise<void> {
  if (globalForSocketIp.__investiqSocketIpSubscribed) return;
  globalForSocketIp.__investiqSocketIpSubscribed = true;

  const { subscribe } = await import("node:diagnostics_channel");
  subscribe("http.server.request.start", stampSocketIpHeader);
}

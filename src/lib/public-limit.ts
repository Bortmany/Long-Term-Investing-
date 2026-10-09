// The per-visitor limit for public pages, the sitemap and robots. Runs in the
// proxy (before any page cache). The visitor is identified by address only:
// the trusted forwarded address when TRUST_PROXY_HEADERS is on, otherwise the
// server-stamped socket address. NO cookie is ever read or set here, and the
// address is never logged or stored (it lives in memory for about a minute).
// If no address can be determined the limit is skipped for that request (one
// warning, with no address in it) rather than lumping everyone together.

import { logger } from "@/lib/logger";
import { publicLimitClass } from "@/lib/public-paths";
import {
  getClientIp,
  getSocketIp,
  ipKey,
  PUBLIC_FILE_RATE_LIMIT,
  PUBLIC_PAGE_RATE_LIMIT,
  rateLimit,
  shouldTrustProxyHeaders,
} from "@/lib/rate-limit";

export type PublicLimitDenial = {
  kind: "page" | "file";
  retryAfterSeconds: number;
};

let warnedNoAddress = false;

/** The visitor address to count against, or null when it cannot be known. */
export function publicVisitorAddress(headers: Headers): string | null {
  if (shouldTrustProxyHeaders()) {
    const forwarded = getClientIp(headers, { trustProxyHeaders: true });
    if (forwarded && forwarded !== "unknown") return forwarded;
  }
  return getSocketIp(headers);
}

/** Count this request; returns a denial when the visitor is over the limit. */
export function checkPublicRateLimit(
  pathname: string,
  headers: Headers,
): PublicLimitDenial | null {
  const kind = publicLimitClass(pathname);
  if (!kind) return null;

  const address = publicVisitorAddress(headers);
  if (!address) {
    if (!warnedNoAddress) {
      warnedNoAddress = true;
      logger.warn("Public page limit skipped: visitor address could not be determined.");
    }
    return null;
  }

  const result = rateLimit(
    ipKey(kind === "page" ? "public-page" : "public-file", address),
    kind === "page" ? PUBLIC_PAGE_RATE_LIMIT : PUBLIC_FILE_RATE_LIMIT,
  );
  return result.ok ? null : { kind, retryAfterSeconds: result.retryAfterSeconds };
}

/** The 429 body for a page: one small self-contained HTML page, no scripts. */
export function tooManyRequestsPage(retryAfterSeconds: number): string {
  const seconds = Math.max(1, Math.round(retryAfterSeconds));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Too many requests | InvestIQ AI</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.card{box-sizing:border-box;width:100%;max-width:384px;margin:16px;padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:8px}
.brand{font-size:16px;font-weight:700;margin:0 0 16px}h1{font-size:20px;margin:0 0 8px}p{font-size:14px;margin:0 0 12px}.small{font-size:12px;color:#475569}
a{display:inline-flex;align-items:center;min-height:44px;font-size:14px;color:inherit}
@media (prefers-color-scheme:dark){body{background:#020617;color:#f8fafc}.card{background:#0f172a;border-color:#1e293b}.small{color:#94a3b8}}
</style></head><body><div class="card"><p class="brand">InvestIQ AI</p><h1>Too many requests</h1><p>You've opened a lot of pages very quickly. Please wait about ${seconds} second${seconds === 1 ? "" : "s"}, then reload.</p><p class="small">Nothing is wrong with your account. This only slows down automated traffic.</p><a href="/">Back to the home page</a></div></body></html>`;
}

export function tooManyRequestsText(retryAfterSeconds: number): string {
  const seconds = Math.max(1, Math.round(retryAfterSeconds));
  return `Too many requests. Please wait about ${seconds} second${seconds === 1 ? "" : "s"}.`;
}

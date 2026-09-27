// Which identity to rate-limit an ANONYMOUS caller (sign-in / sign-up) by.
//
// See the long note in src/lib/rate-limit.ts: with the proxy headers untrusted
// (the default) there is no real client IP to key on, so we key on a stable
// per-browser id kept in a signed httpOnly cookie. This module is the part that
// touches cookies (next/headers), kept separate from the pure sign/verify
// helpers so those stay unit-testable without a request.

import { cookies } from "next/headers";
import {
  ANON_ID_COOKIE,
  getClientIp,
  getSocketIp,
  mintAnonId,
  shouldTrustProxyHeaders,
  signAnonId,
  verifyAnonId,
} from "@/lib/rate-limit";

/** One year — a rate-limit id, not a login, so a long life is fine. */
const ANON_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * The value to key an anonymous rate-limit bucket on.
 *
 * - TRUST_PROXY_HEADERS on  → the real client IP (existing behaviour, used
 *   when the app sits behind a proxy that overwrites the forwarding headers).
 * - TRUST_PROXY_HEADERS off (default), cookie present → the signed
 *   per-browser id from the cookie.
 * - TRUST_PROXY_HEADERS off (default), NO cookie yet → the real TCP socket
 *   IP (see SOCKET_IP_HEADER / getSocketIp in rate-limit.ts), which is
 *   stamped onto the request by src/instrumentation.ts and can't be spoofed
 *   by the caller. We ALSO mint an id and set the cookie here so every
 *   later request from this same browser moves onto its own per-browser
 *   bucket — the socket IP is only ever the fallback for the (possibly many)
 *   requests before a cookie lands, or for a client that never keeps
 *   cookies at all (curl, a bot). That matters: a cookie-less caller is one
 *   real, stable TCP source and must be bounded like one — minting a fresh
 *   id on every single request (the previous behaviour) left it effectively
 *   unthrottled. Two different real sources still land in two different
 *   buckets; the same source repeating requests shares one, bounded bucket.
 *   If the socket-IP signal is unavailable for some reason (e.g. a test
 *   harness building a bare Request, bypassing the real HTTP server), we
 *   fall back to the freshly minted id so first contact still never
 *   collapses into one shared "unknown" bucket.
 *
 * Regardless of what this returns, the per-account (email) key in the auth
 * route still bounds brute force against any single account.
 */
export async function anonymousRateLimitId(headers: Headers): Promise<string> {
  if (shouldTrustProxyHeaders()) {
    return getClientIp(headers);
  }

  const cookieStore = await cookies();
  const existing = verifyAnonId(cookieStore.get(ANON_ID_COOKIE)?.value);
  if (existing) return existing;

  // First contact (or a caller that never keeps cookies): mint an id and set
  // the signed cookie so the NEXT request from a real browser reuses it —
  // but key THIS request on the real socket IP when we have one, so a
  // cookie-dropping source is bounded by who it really is, not handed a
  // fresh bucket every time.
  const fresh = mintAnonId();
  cookieStore.set(ANON_ID_COOKIE, signAnonId(fresh), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ANON_COOKIE_MAX_AGE_SECONDS,
  });

  const socketIp = getSocketIp(headers);
  return socketIp ? `socket:${socketIp}` : fresh;
}

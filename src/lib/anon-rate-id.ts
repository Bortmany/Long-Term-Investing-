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
 * - TRUST_PROXY_HEADERS off (default) → the signed per-browser id from the
 *   cookie. On FIRST contact (no valid cookie yet) we mint one and set it for
 *   next time, and this single request keys on the shared "unknown" bucket;
 *   every later request from that browser then keys on its own id, so returning
 *   visitors never share ONE global bucket and can't lock each other out.
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

  // First contact from this browser: mint an id and set the signed cookie so
  // the NEXT request gets its own bucket. This request keys on "unknown".
  const fresh = mintAnonId();
  cookieStore.set(ANON_ID_COOKIE, signAnonId(fresh), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ANON_COOKIE_MAX_AGE_SECONDS,
  });
  return "unknown";
}

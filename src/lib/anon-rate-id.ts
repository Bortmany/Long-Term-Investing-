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
 *   cookie. On FIRST contact (no valid cookie yet) we mint one, set it for
 *   next time, AND key this very first request on that same fresh id — never
 *   on a shared "unknown" bucket. Every request from that browser (this one
 *   included) then keys on its own id, so no two browsers — and no browser's
 *   very first request — ever share one global bucket or can lock each other
 *   out. A truly cookie-less caller (script that drops Set-Cookie, e.g. curl)
 *   still gets a fresh id per request, which is the correct outcome: it's
 *   indistinguishable from many different first-time visitors, not one
 *   attacker who should be bucketed together.
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

  // First contact from this browser: mint an id, set the signed cookie so the
  // NEXT request reuses it, and key THIS request on it too — first contact
  // must never collapse into a shared "unknown" bucket.
  const fresh = mintAnonId();
  cookieStore.set(ANON_ID_COOKIE, signAnonId(fresh), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ANON_COOKIE_MAX_AGE_SECONDS,
  });
  return fresh;
}

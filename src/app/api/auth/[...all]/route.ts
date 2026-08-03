import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  AUTH_RATE_LIMIT,
  emailKey,
  ipKey,
  rateLimit,
  rateLimitMessage,
  tokenKey,
  type RateLimitResult,
} from "@/lib/rate-limit";
import { anonymousRateLimitId } from "@/lib/anon-rate-id";
import { logger } from "@/lib/logger";

const handlers = toNextJsHandler(auth);

// Reads (session checks etc.) are untouched.
export const GET = handlers.GET;

/** Pull the email out of a parsed JSON body, if it looks like one. */
function emailFromBody(body: unknown): string | null {
  if (body && typeof body === "object" && "email" in body) {
    const value = (body as { email?: unknown }).email;
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

/**
 * Pull a reset/verification token out of the request, if present — from the
 * JSON body (reset-password sends `{ newPassword, token }`) or the URL query
 * (some flows put `?token=…`). Lets us bound guesses against ONE token.
 */
function tokenFromRequest(body: unknown, url: string): string | null {
  if (body && typeof body === "object" && "token" in body) {
    const value = (body as { token?: unknown }).token;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  try {
    const fromQuery = new URL(url).searchParams.get("token");
    if (fromQuery && fromQuery.trim()) return fromQuery.trim();
  } catch {
    // A malformed URL can't yield a token — fall through.
  }
  return null;
}

// Rate-limit EVERY sensitive auth POST — sign-in, sign-up, forget-password and
// reset-password — so one source can't brute-force passwords, spam accounts,
// or hammer the password-reset flow. This is now the ONLY auth limiter: Better
// Auth's built-in one (which keyed on the raw IP and collapsed to a single
// shared bucket when unproxied) is disabled in src/lib/auth.ts.
//
// Two kinds of key are checked on every POST:
//   1. the CALLER key — a stable signed per-browser id (or the real IP behind
//      a trusted proxy), so separate browsers never share one bucket; and
//   2. a per-TARGET key — the email when the body has one, and/or the reset
//      token — so an attack on one account or one reset link stays bounded no
//      matter how many browsers (cookie jars) or spoofed IPs it rotates through.
// Denials return 429 with a plain-English message and Retry-After.
export async function POST(request: Request): Promise<Response> {
  // --- Malformed body → a clean 400, never a 500 -------------------------
  // Read a CLONE so Better Auth still gets the untouched original stream.
  const contentType = request.headers.get("content-type") ?? "";
  let parsedBody: unknown = null;
  if (contentType.includes("application/json")) {
    const raw = await request.clone().text();
    if (raw.trim().length > 0) {
      try {
        parsedBody = JSON.parse(raw);
      } catch {
        return NextResponse.json(
          {
            message:
              "That request could not be read (its body wasn't valid JSON). Please try again.",
            code: "INVALID_JSON",
          },
          { status: 400 },
        );
      }
    }
  }

  // --- Rate limit by caller AND by any target the request identifies -----
  // "Caller" is the real IP when a trusted proxy is configured, otherwise a
  // stable signed per-browser id (so anonymous visitors don't all share one
  // bucket and lock each other out). The per-target keys below still bound an
  // attack on a single account/token regardless of caller.
  const ip = await anonymousRateLimitId(request.headers);
  const ipResult = rateLimit(ipKey("auth", ip), AUTH_RATE_LIMIT);

  const targetResults: RateLimitResult[] = [];
  const email = emailFromBody(parsedBody);
  if (email) targetResults.push(rateLimit(emailKey("auth", email), AUTH_RATE_LIMIT));
  const token = tokenFromRequest(parsedBody, request.url);
  if (token) targetResults.push(rateLimit(tokenKey("auth", token), AUTH_RATE_LIMIT));

  const deniedTarget = targetResults.find(
    (r): r is { ok: false; retryAfterSeconds: number } => !r.ok,
  );

  if (!ipResult.ok || deniedTarget) {
    const retryAfterSeconds = !ipResult.ok
      ? ipResult.retryAfterSeconds
      : deniedTarget!.retryAfterSeconds;
    // Log which kind of limit tripped (caller vs a specific account/token) but
    // never the email or token value itself.
    logger.warn("Auth request rate-limited", {
      ip,
      by: !ipResult.ok ? "caller" : "target",
    });
    return NextResponse.json(
      { message: rateLimitMessage(retryAfterSeconds), code: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      },
    );
  }

  const response = await handlers.POST(request);

  // --- Don't leak whether an email is already registered -----------------
  // On the sign-up endpoint, Better Auth returns a distinct "user already
  // exists" error, which lets anyone probe which emails have accounts. Replace
  // it with a neutral message that reveals nothing either way.
  if (new URL(request.url).pathname.includes("/sign-up") && !response.ok) {
    const masked = await maskExistenceLeak(response);
    if (masked) return masked;
  }

  return response;
}

/**
 * If the sign-up response reveals that the email already exists, return a
 * neutral replacement; otherwise return null (leave the original untouched).
 */
async function maskExistenceLeak(response: Response): Promise<Response | null> {
  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return null;
  }
  const code =
    payload && typeof payload === "object" && "code" in payload
      ? String((payload as { code?: unknown }).code ?? "")
      : "";
  const message =
    payload && typeof payload === "object" && "message" in payload
      ? String((payload as { message?: unknown }).message ?? "")
      : "";
  const revealsExistence =
    /already/i.test(code) ||
    /exist/i.test(code) ||
    /already/i.test(message) ||
    /exist/i.test(message);
  if (!revealsExistence) return null;

  return NextResponse.json(
    {
      message:
        "We couldn't create an account with those details. If you already have an account, sign in instead.",
      code: "SIGN_UP_FAILED",
    },
    { status: response.status },
  );
}

import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { auth, getSignUpStatus } from "@/lib/auth";
import {
  AUTH_RATE_LIMIT,
  EMAIL_SEND_RATE_LIMIT,
  SIGNUP_RATE_LIMIT,
  emailKey,
  ipKey,
  peekRateLimit,
  rateLimit,
  rateLimitMessage,
  resetRateLimit,
  tokenKey,
  type RateLimitResult,
} from "@/lib/rate-limit";
import { anonymousRateLimitId } from "@/lib/anon-rate-id";
import { logger } from "@/lib/logger";
import { authEmailStore, type AuthEmailStore } from "@/lib/email/auth-emails";
import { isEmailConfigured } from "@/lib/email/send";
import {
  EMAIL_NOT_SET_UP_RESEND_MESSAGE,
  EMAIL_SEND_FAILED_MESSAGE,
  EMAIL_SEND_LIMITED_MESSAGE,
  SIGNUPS_PAUSED_MESSAGE,
  SIGNUPS_UNAVAILABLE_MESSAGE,
  type EmailDelivery,
} from "@/lib/auth-schema";

const handlers = toNextJsHandler(auth);

// Reads (session checks, the verify-email link, the reset-link check) are
// untouched.
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

/** A 429 with a plain-English message, Retry-After, and the wait in the body. */
function tooMany(retryAfterSeconds: number, code: string, message?: string): Response {
  return NextResponse.json(
    {
      message: message ?? rateLimitMessage(retryAfterSeconds),
      code,
      retryAfterSeconds,
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

/** Read a JSON response body without consuming the original. */
async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const payload = await response.clone().json();
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The same response with extra fields merged into its JSON body. Status and
 * headers (including the session cookie, if any) are kept.
 */
function withExtraFields(
  response: Response,
  payload: Record<string, unknown>,
  extra: Record<string, unknown>,
): Response {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify({ ...payload, ...extra }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Rate-limit EVERY sensitive auth POST — sign-in, sign-up, resend
// confirmation, request-password-reset (and its old name forget-password),
// reset-password — so one source can't brute-force passwords, spam accounts,
// or hammer the email flows. This is the ONLY auth limiter: Better Auth's
// built-in one (which keyed on the raw IP and collapsed to a single shared
// bucket when unproxied) is disabled in src/lib/auth.ts.
//
// Checks on every POST:
//   1. the CALLER key — a stable signed per-browser id (or the real IP behind
//      a trusted proxy), 10 a minute, so separate browsers never share one
//      bucket; and
//   2. a per-TARGET key — the email when the body has one, and/or the reset
//      token — so an attack on one account or one reset link stays bounded no
//      matter how many browsers (cookie jars) or spoofed IPs it rotates through.
// Plus, from "Go public safely":
//   3. sign-up: 5 an hour per caller (SIGNUP_RATE_LIMIT), and a refusal when
//      sign-ups are paused or unavailable (getSignUpStatus) — not just a
//      hidden form;
//   4. resend-confirmation and reset requests: 5 an hour per email address
//      (EMAIL_SEND_RATE_LIMIT). Emails sent by sign-up and sign-in count
//      against the same hourly limit inside sendAuthEmail.
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

  const pathname = new URL(request.url).pathname;
  const isSignInEmail = pathname.endsWith("/sign-in/email");
  const isSignUp = pathname.includes("/sign-up");
  const isResendConfirmation = pathname.endsWith("/send-verification-email");
  const isResetRequest =
    pathname.endsWith("/request-password-reset") || pathname.endsWith("/forget-password");

  // --- Resend confirmation with no email set up -> say so, honestly ------
  // Nothing can be sent, so never answer "sent" (Better Auth would answer
  // "ok" even for an address it never emailed).
  if (isResendConfirmation && !isEmailConfigured()) {
    return NextResponse.json(
      { message: EMAIL_NOT_SET_UP_RESEND_MESSAGE, code: "EMAIL_NOT_SET_UP" },
      { status: 503 },
    );
  }

  // --- Sign-ups paused or unavailable → refused on the server too --------
  if (isSignUp) {
    const status = getSignUpStatus();
    if (!status.open) {
      return NextResponse.json(
        status.reason === "paused"
          ? { message: SIGNUPS_PAUSED_MESSAGE, code: "SIGNUPS_PAUSED" }
          : { message: SIGNUPS_UNAVAILABLE_MESSAGE, code: "SIGNUPS_UNAVAILABLE" },
        { status: 403 },
      );
    }
  }

  // --- Rate limit by caller AND by any target the request identifies -----
  // "Caller" is the real IP when a trusted proxy is configured, otherwise a
  // stable signed per-browser id (so anonymous visitors don't all share one
  // bucket and lock each other out). The per-target keys below still bound an
  // attack on a single account/token regardless of caller.
  const ip = await anonymousRateLimitId(request.headers);
  const ipResult = rateLimit(ipKey("auth", ip), AUTH_RATE_LIMIT);

  // Sign-in's per-account (email) key is handled OUTCOME-BASED, after Better
  // Auth has verified the password (see below) — pre-checking/incrementing it
  // here, like every other target key, is exactly what let a pile of WRONG
  // guesses against one email lock out that account's own CORRECT password
  // for the rest of the window (a single-account lockout DoS by anyone who
  // knows the email). Sign-up and the email flows keep the pre-check: they
  // don't have a "correct password" outcome to protect.
  const targetResults: RateLimitResult[] = [];
  const email = emailFromBody(parsedBody);
  if (email && !isSignInEmail) {
    targetResults.push(rateLimit(emailKey("auth", email), AUTH_RATE_LIMIT));
  }
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
    return tooMany(retryAfterSeconds, "RATE_LIMITED");
  }

  // --- Sign-up: at most 5 an hour from one caller ------------------------
  if (isSignUp) {
    const hourly = rateLimit(ipKey("signup", ip), SIGNUP_RATE_LIMIT);
    if (!hourly.ok) {
      logger.warn("Auth request rate-limited", { ip, by: "signup-hourly" });
      return tooMany(hourly.retryAfterSeconds, "RATE_LIMITED");
    }
  }

  // --- Account emails: at most 5 an hour for one address ------------------
  // Counted here for resend and reset requests (whether or not the address
  // has an account, so the limit itself can't reveal that), and marked as
  // counted so sendAuthEmail doesn't count the same request twice.
  const store: AuthEmailStore = { emailSendCounted: false };
  if ((isResendConfirmation || isResetRequest) && email) {
    const hourly = rateLimit(emailKey("email-send", email), EMAIL_SEND_RATE_LIMIT);
    if (!hourly.ok) {
      logger.warn("Auth request rate-limited", { ip, by: "email-send-hourly" });
      return tooMany(hourly.retryAfterSeconds, "EMAIL_SEND_LIMITED", EMAIL_SEND_LIMITED_MESSAGE);
    }
    store.emailSendCounted = true;
  }

  // Run Better Auth with a per-request store that sendAuthEmail fills in
  // with the honest outcome of any email it sends (Better Auth swallows
  // send failures during sign-up and sign-in, so this is how we find out).
  const response = await authEmailStore.run(store, () => handlers.POST(request));
  const payload = await readJson(response);
  const code = typeof payload?.code === "string" ? payload.code : "";

  // --- Sign-in per-account guard: OUTCOME-based ---------------------------
  // Better Auth has just verified the password. Only a WRONG password ever
  // counts against the per-email bucket, and a RIGHT password always gets
  // in — even while this email has a pile of recent wrong guesses — and
  // clears the bucket. So the brute-force protection can never be turned
  // into a lockout weapon against the account's real owner. A right
  // password on an account that isn't confirmed yet ("EMAIL_NOT_VERIFIED",
  // which Better Auth only answers AFTER checking the password) is not a
  // wrong guess either, so it isn't counted.
  if (isSignInEmail && email) {
    const key = emailKey("auth", email);
    const rightPasswordButUnconfirmed = response.status === 403 && code === "EMAIL_NOT_VERIFIED";
    if (response.ok) {
      resetRateLimit(key);
    } else if (!rightPasswordButUnconfirmed) {
      // Already over the limit from previous wrong guesses? Reject THIS
      // attempt too, without registering another hit (peek doesn't count).
      const peeked = peekRateLimit(key, AUTH_RATE_LIMIT);
      if (!peeked.ok) {
        logger.warn("Auth request rate-limited", { ip, by: "target" });
        return tooMany(peeked.retryAfterSeconds, "RATE_LIMITED");
      }
      // Register this wrong guess so enough of them (still) trip the guard.
      rateLimit(key, AUTH_RATE_LIMIT);
    }
    if (rightPasswordButUnconfirmed && payload) {
      // Tell the sign-in screen honestly whether the fresh link went out.
      const emailDelivery: EmailDelivery = store.outcome ?? "failed";
      return withExtraFields(response, payload, { emailDelivery });
    }
  }

  // --- Sign-up: don't leak whether an email is already registered --------
  // With email set up, Better Auth already answers a duplicate exactly like a
  // new sign-up (and src/lib/auth.ts emails the real owner). Without email
  // it returns a distinct "user already exists" error, which lets anyone
  // probe which emails have accounts — replaced with a neutral message.
  if (isSignUp && !response.ok) {
    const masked = maskExistenceLeak(response, payload);
    if (masked) return masked;
  }

  // --- Sign-up succeeded: say honestly whether the email went out --------
  if (isSignUp && response.ok && payload) {
    const signedInAlready = typeof payload.token === "string" && payload.token.length > 0;
    const emailDelivery: EmailDelivery = signedInAlready
      ? "not_needed"
      : (store.outcome ?? "failed");
    return withExtraFields(response, payload, { emailDelivery });
  }

  // --- Resend confirmation: never answer "sent" when it wasn't -----------
  if (isResendConfirmation && store.outcome && store.outcome !== "sent") {
    return NextResponse.json(
      store.outcome === "rate_limited"
        ? { message: EMAIL_SEND_LIMITED_MESSAGE, code: "EMAIL_SEND_LIMITED" }
        : { message: EMAIL_SEND_FAILED_MESSAGE, code: "EMAIL_SEND_FAILED" },
      { status: store.outcome === "rate_limited" ? 429 : 503 },
    );
  }

  // Reset requests always give the same answer (telling the person the send
  // failed would reveal the account exists); sendAuthEmail has already
  // logged the failure (and reported it to Sentry when configured).
  return response;
}

/**
 * If the sign-up response reveals that the email already exists, return a
 * neutral replacement; otherwise return null (leave the original untouched).
 */
function maskExistenceLeak(
  response: Response,
  payload: Record<string, unknown> | null,
): Response | null {
  if (!payload) return null;
  const code = String(payload.code ?? "");
  const message = String(payload.message ?? "");
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

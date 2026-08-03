import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  AUTH_RATE_LIMIT,
  emailKey,
  getClientIp,
  ipKey,
  rateLimit,
  rateLimitMessage,
} from "@/lib/rate-limit";
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

// Rate-limit auth POSTs (sign-in / sign-up) so one source can't brute-force
// passwords or spam new accounts. Two keys are checked: the visitor IP AND the
// target email — so an attacker can't dodge the limit by spoofing
// x-forwarded-for (a fresh IP per request), because the per-email bucket still
// fills up. Denials return 429 with a plain-English message and Retry-After.
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

  // --- Rate limit by IP and by target email ------------------------------
  const ip = getClientIp(request.headers);
  const ipResult = rateLimit(ipKey("auth", ip), AUTH_RATE_LIMIT);

  const email = emailFromBody(parsedBody);
  const emailResult = email
    ? rateLimit(emailKey("auth", email), AUTH_RATE_LIMIT)
    : { ok: true as const, remaining: AUTH_RATE_LIMIT.limit };

  if (!ipResult.ok || !emailResult.ok) {
    const retryAfterSeconds = !ipResult.ok
      ? ipResult.retryAfterSeconds
      : (emailResult as { ok: false; retryAfterSeconds: number }).retryAfterSeconds;
    // Log the reason (per-IP vs per-account) but never the email itself.
    logger.warn("Auth request rate-limited", {
      ip,
      by: !ipResult.ok ? "ip" : "email",
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

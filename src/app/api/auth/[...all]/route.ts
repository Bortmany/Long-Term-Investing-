import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  AUTH_RATE_LIMIT,
  getClientIp,
  ipKey,
  rateLimit,
  rateLimitMessage,
} from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const handlers = toNextJsHandler(auth);

// Reads (session checks etc.) are untouched.
export const GET = handlers.GET;

// Rate-limit auth POSTs (sign-in / sign-up) by visitor IP so one source can't
// brute-force passwords or spam new accounts. Denials return 429 with a plain
// -English message and a Retry-After header.
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request.headers);
  const result = rateLimit(ipKey("auth", ip), AUTH_RATE_LIMIT);

  if (!result.ok) {
    logger.warn("Auth request rate-limited", { ip });
    return NextResponse.json(
      { message: rateLimitMessage(result.retryAfterSeconds), code: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "Retry-After": String(result.retryAfterSeconds) },
      },
    );
  }

  return handlers.POST(request);
}

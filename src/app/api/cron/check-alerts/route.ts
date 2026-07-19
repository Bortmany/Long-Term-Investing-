// Secure cron trigger for scheduled alert checks (BUILD-PLAN.md Phase 7).
// POST only, same secure idiom as src/app/api/cron/weekly-review/route.ts
// (copied deliberately, not re-derived) — a bearer secret, never the session
// cookie proxy.ts checks. Both cron routes share ONE CRON_SECRET.
//
// GOLDEN RULE for this route specifically: with no CRON_SECRET configured,
// scheduling is a first-class, honest "dormant" state (503), never a silent
// no-op and never a 500 — same discipline the AI layer uses for "no key".

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getClientIp, ipKey, rateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { sweepAlerts } from "@/lib/alerts/engine";

// A generous but bounded limit on the trigger itself — a misconfigured
// scheduler retrying in a loop shouldn't be able to hammer the alert sweep
// repeatedly within a minute.
const CRON_TRIGGER_RATE_LIMIT = { limit: 5, windowMs: 60_000 };

/** Constant-time string compare so a wrong guess can't be timed to narrow down the secret. */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      {
        status: "dormant",
        message:
          "Scheduled alert checks are turned off (no CRON_SECRET configured). Set " +
          "CRON_SECRET in your environment and call this route with " +
          "Authorization: Bearer <CRON_SECRET> to turn it on.",
      },
      { status: 503 },
    );
  }

  const ip = getClientIp(request.headers);
  const limited = rateLimit(ipKey("cron-check-alerts", ip), CRON_TRIGGER_RATE_LIMIT);
  if (!limited.ok) {
    return NextResponse.json(
      { message: rateLimitMessage(limited.retryAfterSeconds) },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token || !timingSafeEqualStrings(token, secret)) {
    logger.warn("Cron check-alerts request rejected: missing or invalid bearer token", { ip });
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const summary = await sweepAlerts("all-users");
  logger.info("Scheduled alert sweep finished", summary);

  // Counts only — never any per-user data (id, email, alert contents) in a
  // response a scheduler's own logs might retain.
  return NextResponse.json({ status: "ok", ...summary });
}

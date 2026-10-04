// Secure cron trigger for the daily Sharia screen refresh (Step 5).
// POST only, same secure idiom as the other cron routes (copied deliberately):
// a bearer secret, never the session cookie.
//
// DORMANT, honestly: no CRON_SECRET gives 503; a correct secret but no
// supplier key also gives 503 and makes NO outside call. The key check comes
// AFTER the bearer check on purpose, so a stranger can't learn the setup.

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getClientIp, ipKey, rateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { getActiveVendor } from "@/lib/sharia/config";
import { DAILY_MAX_INSTRUMENTS, refreshShariaScreens } from "@/lib/sharia/refresh";

const CRON_TRIGGER_RATE_LIMIT = { limit: 5, windowMs: 60_000 };

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
          "The Sharia screen refresh is turned off (no CRON_SECRET configured). Set " +
          "CRON_SECRET and call this route with Authorization: Bearer <CRON_SECRET>.",
      },
      { status: 503 },
    );
  }

  const ip = getClientIp(request.headers);
  const limited = rateLimit(ipKey("cron-sharia-refresh", ip), CRON_TRIGGER_RATE_LIMIT);
  if (!limited.ok) {
    return NextResponse.json(
      { message: rateLimitMessage(limited.retryAfterSeconds) },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token || !timingSafeEqualStrings(token, secret)) {
    logger.warn("Cron sharia-refresh request rejected: missing or invalid bearer token", { ip });
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const vendor = getActiveVendor();
  if (!vendor) {
    return NextResponse.json(
      {
        status: "dormant",
        message: "Sharia screening is off (no MUSAFFA_API_KEY, or an unknown SHARIA_VENDOR). No outside call was made.",
      },
      { status: 503 },
    );
  }

  const summary = await refreshShariaScreens(
    { scope: "all-users", maxInstruments: DAILY_MAX_INSTRUMENTS },
    { vendor },
  );
  logger.info("Scheduled Sharia refresh finished", { ...summary });

  if (summary.status === "skipped") {
    return NextResponse.json({ status: "ok", skipped: "nobody has turned the screen on" });
  }
  // Counts only: no per-user data, no per-stock lists.
  const { status: _status, message: _message, ...counts } = summary;
  void _status;
  void _message;
  return NextResponse.json({ status: "ok", ...counts });
}

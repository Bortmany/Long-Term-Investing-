import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth, getSignUpStatus } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email/send";
import { getBillingMode } from "@/lib/billing/config";
import { isTwelveDataConfigured } from "@/lib/data/provider-info";
import { isShariaConfigured } from "@/lib/sharia/config";
import { isBrokerConnectionEnabled } from "@/lib/broker/config";

// Always answers 200. `db` tells you whether the database is reachable.
//
// Anonymous callers (the host's health check, anyone on the internet) get
// ONLY `{ status, db }`. The integration detail — whether Sentry, cron,
// email are configured and whether sign-ups are open — is useful to an
// operator but is also a map of the deployment for an attacker, so it is
// returned only when the request carries a valid session cookie or the
// cron bearer secret (`Authorization: Bearer <CRON_SECRET>`).
//
// `signups` reflects the SAME getSignUpStatus() gate src/lib/auth.ts
// enforces ("open", or "paused" with a `signupsReason` of "SIGNUPS_PAUSED" or
// "email_not_configured"), and `billing` is getBillingMode() ("dormant",
// "test" or "live"). Like the rest of the detail, an operator sees these
// only when signed in or holding the cron secret — not from the outside.

/** Constant-time string compare so a wrong guess can't be timed to narrow down the secret.
 *  Same idiom as the cron routes (copied deliberately, not re-derived). */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** True when the request carries `Authorization: Bearer <CRON_SECRET>` and the secret is set. */
function hasCronBearer(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  return scheme === "Bearer" && !!token && timingSafeEqualStrings(token, secret);
}

/** True when the caller is a signed-in user or a trusted scheduler. */
async function isTrustedCaller(request: NextRequest): Promise<boolean> {
  if (hasCronBearer(request)) return true;
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    return !!session;
  } catch {
    // A session lookup that fails (e.g. database down) is simply "not trusted";
    // the health check itself must still answer.
    return false;
  }
}

export async function GET(request: NextRequest) {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }

  if (!(await isTrustedCaller(request))) {
    return NextResponse.json({ status: "ok", db });
  }

  const signUpStatus = getSignUpStatus();
  return NextResponse.json({
    status: "ok",
    db,
    sentry: process.env.SENTRY_DSN ? "configured" : "dormant",
    cron: process.env.CRON_SECRET ? "configured" : "dormant",
    email: isEmailConfigured() ? "configured" : "dormant",
    signups: signUpStatus.open ? "open" : "paused",
    ...(signUpStatus.open
      ? {}
      : {
          signupsReason:
            signUpStatus.reason === "paused" ? "SIGNUPS_PAUSED" : "email_not_configured",
        }),
    billing: getBillingMode(),
    // Twelve Data (Gulf live prices) is off unless a key is set. Only the
    // yes/no answer is shown — never the key itself.
    twelveData: isTwelveDataConfigured() ? "configured" : "dormant",
    // Sharia screening is off unless the supplier key is set (yes/no only).
    sharia: isShariaConfigured() ? "configured" : "dormant",
    // Broker connection is off unless the broker encryption key is valid. Only the
    // yes/no answer is shown, never the key.
    brokerConnection: isBrokerConnectionEnabled() ? "configured" : "dormant",
  });
}

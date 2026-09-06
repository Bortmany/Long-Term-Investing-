import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth, signUpsAllowed } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email/send";

// Always answers 200. `db` tells you whether the database is reachable.
//
// Anonymous callers (the host's health check, anyone on the internet) get
// ONLY `{ status, db }`. The integration detail — whether Sentry, cron,
// email are configured and whether sign-ups are open — is useful to an
// operator but is also a map of the deployment for an attacker, so it is
// returned only when the request carries a valid session cookie or the
// cron bearer secret (`Authorization: Bearer <CRON_SECRET>`).
//
// `signups` reflects the SAME ALLOW_SIGNUPS gate src/lib/auth.ts enforces,
// so an operator can confirm from the outside that a public deployment
// really does have sign-ups closed.

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

  return NextResponse.json({
    status: "ok",
    db,
    sentry: process.env.SENTRY_DSN ? "configured" : "dormant",
    cron: process.env.CRON_SECRET ? "configured" : "dormant",
    email: isEmailConfigured() ? "configured" : "dormant",
    signups: signUpsAllowed() ? "open" : "closed",
  });
}

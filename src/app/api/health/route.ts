import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUpsAllowed } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email/send";

// Always answers 200. `db` tells you whether the database is reachable;
// `sentry` reports whether error tracking is configured or still dormant;
// `signups` reflects the SAME ALLOW_SIGNUPS gate src/lib/auth.ts enforces,
// so an operator can confirm from the outside that a public deployment
// really does have sign-ups closed.
export async function GET() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
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

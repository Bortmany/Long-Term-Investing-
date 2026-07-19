import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Always answers 200. `db` tells you whether the database is reachable;
// `sentry` reports whether error tracking is configured or still dormant.
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
  });
}

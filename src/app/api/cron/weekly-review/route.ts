// Token-protected scheduled endpoint for the weekly review (BUILD-PLAN Phase
// 6 / "Cross-cutting decisions" #2: scheduling is DEFERRED — this route
// exists so a future scheduler has something real to call, but nothing in
// this repo currently invokes it; see
// .github/workflows/weekly-review.yml.example, which is disabled by its
// `.example` suffix.
//
// Auth model (deliberately simple, no session cookie involved):
//   1. The `Authorization: Bearer <token>` header must match CRON_SECRET
//      exactly. Unset CRON_SECRET, missing header, or a mismatched token all
//      return 401 immediately — never proceed.
//   2. The user to run the review for comes ONLY from CRON_USER_ID (an env
//      var the OWNER sets), never from the request body/query. A caller who
//      merely has the bearer token still cannot target an arbitrary account.
//   3. If CRON_USER_ID is unset, the route answers 501 with a plain-English
//      explanation — it is simply not configured yet, not a server error.
//
// This route is listed in PUBLIC_PATHS (src/proxy.ts) so the session-cookie
// proxy doesn't redirect it to /sign-in — the token check above is the real
// gate, the proxy exemption only lets the request reach it.

import { NextResponse, type NextRequest } from "next/server";

import { runWeeklyReviewForUser } from "@/lib/reviews/weekly-review-engine";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!cronSecret || !bearerToken || bearerToken !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const cronUserId = process.env.CRON_USER_ID;
  if (!cronUserId) {
    return NextResponse.json(
      {
        error:
          "This route is not configured yet — set CRON_USER_ID (and CRON_SECRET) to enable it.",
      },
      { status: 501 },
    );
  }

  const result = await runWeeklyReviewForUser(cronUserId);
  return NextResponse.json(result);
}

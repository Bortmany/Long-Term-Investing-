import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { isSameOrigin } from "@/lib/request-origin";
import { isActionBodyDecodable, NEXT_ACTION_HEADER } from "@/lib/action-body";
import { isPublicPath } from "@/lib/public-paths";
import {
  checkPublicRateLimit,
  tooManyRequestsPage,
  tooManyRequestsText,
} from "@/lib/public-limit";

// Which addresses are public lives in src/lib/public-paths.ts (so tests can
// check it).

// Next.js 16 renamed Middleware to Proxy — same behavior, new file name.
// This is an optimistic redirect based on the presence of the session
// cookie; real session validation happens server-side via auth.api.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // State-changing requests with a MISMATCHED Origin get a clean 400 here,
  // before the request reaches a server action or route handler that would
  // otherwise throw an unhandled 500 (leaking a digest). A missing Origin is
  // allowed (server-to-server calls, health checks); only a present-but-wrong
  // Origin is rejected. Session cookies are SameSite=Lax, so this is
  // defence-in-depth, not the only guard.
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !isSameOrigin(request.headers)) {
    return NextResponse.json(
      {
        message:
          "That request was blocked because it looked like it came from another site. Please reload the page and try again.",
        code: "BAD_ORIGIN",
      },
      { status: 400 },
    );
  }

  // Server Action POST with an undecodable body → the same clean 400 shape,
  // never Next's internal decoder crashing into an unhandled 500.
  if (
    method === "POST" &&
    request.headers.has(NEXT_ACTION_HEADER) &&
    !(await isActionBodyDecodable(request))
  ) {
    return NextResponse.json(
      {
        message:
          "That request could not be read (its data was invalid). Please reload the page and try again.",
        code: "INVALID_BODY",
      },
      { status: 400 },
    );
  }

  if (isPublicPath(pathname)) {
    // Public stock pages, the sitemap and robots: a per-visitor request limit
    // (in memory, no cookie, no stored address). Only plain page/file reads.
    if (method === "GET" || method === "HEAD") {
      const denial = checkPublicRateLimit(pathname, request.headers);
      if (denial) {
        const isPage = denial.kind === "page";
        return new NextResponse(
          isPage
            ? tooManyRequestsPage(denial.retryAfterSeconds)
            : tooManyRequestsText(denial.retryAfterSeconds),
          {
            status: 429,
            headers: {
              "Content-Type": isPage
                ? "text/html; charset=utf-8"
                : "text/plain; charset=utf-8",
              "Retry-After": String(denial.retryAfterSeconds),
              "Cache-Control": "no-store",
            },
          },
        );
      }
    }
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", request.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next.js internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { isSameOrigin } from "@/lib/request-origin";
import { isActionBodyDecodable, NEXT_ACTION_HEADER } from "@/lib/action-body";

// Routes anyone may visit without being signed in.
// /api/cron is public here because it does its OWN auth (a bearer secret
// checked against CRON_SECRET, see src/app/api/cron/weekly-review/route.ts)
// rather than the session cookie every other route needs.
const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  // Account-access screens reached from emails or by signed-out visitors:
  // "check your inbox", the verify-email result page, and password reset.
  "/check-email",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/api/auth",
  "/api/health",
  "/api/cron",
];

// Public on the EXACT path only (no prefix match). The Stripe webhook does its
// own authentication (Stripe's signature, checked with STRIPE_WEBHOOK_SECRET)
// instead of a session cookie. Nothing else under /api/billing is public.
const PUBLIC_EXACT_PATHS = ["/api/billing/webhook"];

function isPublic(pathname: string): boolean {
  // The landing page at "/" is public (exact match only — it can't go in
  // PUBLIC_PATHS or the prefix check would make every route public).
  // Signed-in visitors still end up on /dashboard: src/app/page.tsx checks
  // the session server-side and redirects them.
  if (pathname === "/" || PUBLIC_EXACT_PATHS.includes(pathname)) {
    return true;
  }
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

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

  if (isPublic(pathname)) {
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

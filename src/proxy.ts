import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Routes anyone may visit without being signed in.
// /api/cron is public here because it does its OWN auth (a bearer secret
// checked against CRON_SECRET, see src/app/api/cron/weekly-review/route.ts)
// rather than the session cookie every other route needs.
const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/privacy",
  "/terms",
  "/api/auth",
  "/api/health",
  "/api/cron",
];

function isPublic(pathname: string): boolean {
  // The landing page at "/" is public (exact match only — it can't go in
  // PUBLIC_PATHS or the prefix check would make every route public).
  // Signed-in visitors still end up on /dashboard: src/app/page.tsx checks
  // the session server-side and redirects them.
  if (pathname === "/") {
    return true;
  }
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

// Next.js 16 renamed Middleware to Proxy — same behavior, new file name.
// This is an optimistic redirect based on the presence of the session
// cookie; real session validation happens server-side via auth.api.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

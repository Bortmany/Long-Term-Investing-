// Which addresses a signed-out visitor may open, and which of those get the
// per-visitor request limit. Pure, so tests can check them; src/proxy.ts uses
// them. (Kept out of proxy.ts because a proxy file should only export its
// `proxy` function and `config`.)

// Routes anyone may visit without being signed in.
// /api/cron is public here because it does its OWN auth (a bearer secret
// checked against CRON_SECRET, see src/app/api/cron/weekly-review/route.ts)
// rather than the session cookie every other route needs.
// /s is the public stock pages (the owner's short public list only; see
// src/lib/public-catalogue.ts).
export const PUBLIC_PATHS = [
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
  "/s",
  "/api/auth",
  "/api/health",
  "/api/cron",
];

// Public on the EXACT path only (no prefix match). The Stripe webhook does its
// own authentication (Stripe's signature, checked with STRIPE_WEBHOOK_SECRET)
// instead of a session cookie. Nothing else under /api/billing is public.
// /sitemap.xml and /robots.txt are for search engines.
export const PUBLIC_EXACT_PATHS = ["/api/billing/webhook", "/sitemap.xml", "/robots.txt"];

export function isPublicPath(pathname: string): boolean {
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

/**
 * Which anonymous-visitor limit applies: "page" for /s/..., "file" for the
 * sitemap and robots files, null for everything else (no limit here).
 */
export function publicLimitClass(pathname: string): "page" | "file" | null {
  if (pathname === "/sitemap.xml" || pathname === "/robots.txt") return "file";
  if (pathname === "/s" || pathname.startsWith("/s/")) return "page";
  return null;
}

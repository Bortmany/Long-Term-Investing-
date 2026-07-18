import type { NextConfig } from "next";

// Security headers sent with every response. Plain English:
// - nosniff: browsers must not second-guess file types.
// - SAMEORIGIN / frame-ancestors: no other site may embed this app in a frame.
// - Referrer-Policy: outside links only learn which site you came from, not
//   which page.
// - Permissions-Policy: the app never asks for camera, microphone or location.
// - Content-Security-Policy: the browser only runs code and loads assets from
//   this app itself — a script snuck in from elsewhere simply won't load.
//   ('unsafe-inline' stays because Next.js injects small inline snippets.)
// - Strict-Transport-Security (production only): once visited over HTTPS,
//   browsers refuse to ever talk to the app over plain HTTP.
const isProduction = process.env.NODE_ENV === "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js dev mode needs eval for hot reloading; production does not.
  isProduction
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // 'self' plus Sentry's ingest servers — without these, switching on the
  // dormant browser error tracking (NEXT_PUBLIC_SENTRY_DSN) would have every
  // error report silently blocked by this policy.
  "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Only meaningful over HTTPS, so only sent in production builds.
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Every route gets the security headers.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

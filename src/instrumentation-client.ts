// Client-side observability init (Next.js 16 instrumentation-client file).
//
// Sentry is DORMANT until NEXT_PUBLIC_SENTRY_DSN is set. When it is unset the
// branch is compiled out, so the SDK is never loaded into the browser bundle.

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        tracesSampleRate: 0,
      });
    })
    .catch(() => {
      // Never let instrumentation setup break the app.
    });
}

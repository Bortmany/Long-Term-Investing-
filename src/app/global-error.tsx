"use client";

// Last-resort error boundary. The (app) and dashboard error.tsx files catch
// errors inside the app shell; THIS one catches errors in the root layout
// itself, so it must render its own <html>/<body> and can't rely on the app's
// styles or fonts (inline styles keep it self-contained).
//
// It reports to Sentry only when NEXT_PUBLIC_SENTRY_DSN is set — otherwise the
// dynamic import branch is dropped and error tracking stays completely off.

import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surface it for debugging; nothing sensitive is shown to the user.
    console.error(error);
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import("@sentry/nextjs")
        .then((Sentry) => Sentry.captureException(error))
        .catch(() => {
          // Never let error reporting throw from inside the error boundary.
        });
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#ffffff",
          color: "#0f172a",
        }}
      >
        <main style={{ maxWidth: "24rem", padding: "1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Something went wrong.
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#64748b", margin: "0 0 1.25rem" }}>
            The app hit an unexpected error and couldn&apos;t load this page. You
            can try again.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              cursor: "pointer",
              borderRadius: "0.5rem",
              border: "none",
              background: "#0f172a",
              color: "#ffffff",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

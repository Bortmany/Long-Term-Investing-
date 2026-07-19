import { request as playwrightRequest } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Sign in ONCE for the whole e2e run and save the resulting session cookie to
// disk, so every spec file starts already authenticated instead of repeating
// its own UI sign-in. This is Playwright's own recommended pattern for a
// suite with many auth-gated tests (https://playwright.dev/docs/auth) — and
// it fixes the actual failure this session was asked to diagnose: every spec
// file used to call its own `signIn(page)` helper, and with 8 files doing a
// REAL POST to /api/auth/sign-in/email, the suite easily exceeds
// AUTH_RATE_LIMIT (10 attempts/60s per IP — src/lib/rate-limit.ts) once
// Playwright runs them across parallel workers, because every request comes
// from the same IP (127.0.0.1). The limiter itself is correct and untouched
// — a real attacker still gets the same 10/60s — this only changes how the
// TEST SUITE authenticates, from ~11 real sign-ins per run down to 1 (plus
// the one test that deliberately exercises the sign-in form itself, which
// still needs a real sign-in — see smoke.spec.ts).
//
// SEED_DEMO_PASSWORD unset: every signed-in test already self-skips
// (`test.skip(!DEMO_PASSWORD, ...)`), so we skip signing in too and just
// write an empty (logged-out) storage state — Playwright still needs SOME
// file at the `storageState` path configured in playwright.config.ts.
//
// Path note: this file is plain CommonJS-mode TypeScript (package.json has
// no "type": "module", and Playwright's own TS loader compiles .ts files to
// CommonJS unless told otherwise) so it deliberately avoids `import.meta`,
// which only parses inside a real ES module and throws
// "Cannot use 'import.meta' outside a module" once compiled to CommonJS.
// `process.cwd()` is a safe stand-in here because `npm run test:e2e` /
// `playwright test` always run from the repo root (where this config and
// package.json live).
export const AUTH_STATE_PATH = path.join(process.cwd(), "tests", "e2e", ".auth", "user.json");

try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

export default async function globalSetup(): Promise<void> {
  mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });

  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  const context = await playwrightRequest.newContext({
    baseURL: "http://localhost:3000",
  });

  if (demoPassword) {
    const response = await context.post("/api/auth/sign-in/email", {
      data: { email: "owner@example.com", password: demoPassword },
    });
    if (!response.ok()) {
      throw new Error(
        `E2E auth setup: sign-in failed with status ${response.status()}. Check that ` +
          "SEED_DEMO_PASSWORD in .env matches the password the seed script used.",
      );
    }
  }

  await context.storageState({ path: AUTH_STATE_PATH });
  await context.dispose();
}

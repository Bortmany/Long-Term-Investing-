// The end-to-end tests' OWN login. The global setup (global-setup.ts)
// creates it on the local test database, confirms its email, gives it the
// same sample portfolio as the demo login, and signs in once. Every spec
// uses these exports instead of the demo login (which production never has).
//
// The password comes from E2E_TEST_PASSWORD; the fallback below exists for
// LOCAL runs only — the setup refuses to run against anything but a
// database on this machine, so a known-password account can never be
// created on a live site.

try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

export const E2E_USER_EMAIL = "e2e-test@investiq.test";
export const E2E_USER_NAME = "E2E Test User";
const LOCAL_ONLY_DEFAULT_PASSWORD = "local-e2e-only-password-2026";
export const E2E_USER_PASSWORD: string =
  process.env.E2E_TEST_PASSWORD?.trim() || LOCAL_ONLY_DEFAULT_PASSWORD;

/** The dev server port the tests use (E2E_PORT, default 3000 as in CI). */
export const E2E_PORT = Number(process.env.E2E_PORT) || 3000;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

// The safety guard lives in its own side-effect-free file so unit tests can
// check it without loading .env.
export { assertLocalTestDatabase } from "./local-db-guard";

import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import { AUTH_STATE_PATH } from "./tests/e2e/global-setup";
import { E2E_BASE_URL, E2E_PORT } from "./tests/e2e/test-user";

// E2E tests are kept OUT of `npm run test` (unit tests only).
// Run them with: npm run test:e2e
//
// Overridable by environment (defaults are unchanged for CI):
// - E2E_PORT: the dev server port (default 3000).
// - PLAYWRIGHT_CHROMIUM_PATH: the browser to launch. Default: the
//   preinstalled Linux browser under /opt/pw-browsers when it exists (never
//   run `playwright install` in that environment); on any other machine,
//   Playwright's own installed browser.

const LINUX_PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CHROMIUM_PATH =
  process.env.PLAYWRIGHT_CHROMIUM_PATH?.trim() ||
  (existsSync(LINUX_PREINSTALLED_CHROMIUM) ? LINUX_PREINSTALLED_CHROMIUM : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  // Dev-server pages compile on first visit, which can exceed the 5s default.
  expect: { timeout: 15_000 },
  // Create the e2e login and sign in once (tests/e2e/global-setup.ts)
  // instead of every spec file repeating its own sign-in.
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: E2E_BASE_URL,
    // Every test starts already signed in as the e2e test user
    // (tests/e2e/test-user.ts). The handful of tests that specifically need
    // to start signed OUT override this per-test with
    // `test.use({ storageState: { cookies: [], origins: [] } })`.
    storageState: AUTH_STATE_PATH,
    launchOptions: CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {},
  },
  webServer: {
    command: E2E_PORT === 3000 ? "npm run dev" : `npm run dev -- --port ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

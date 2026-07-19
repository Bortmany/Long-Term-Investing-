import { defineConfig } from "@playwright/test";
import { AUTH_STATE_PATH } from "./tests/e2e/global-setup";

// E2E tests are kept OUT of `npm run test` (unit tests only).
// Run them with: npm run test:e2e
// Browsers are preinstalled under /opt/pw-browsers — never run
// `playwright install` in this environment.

const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  // Dev-server pages compile on first visit, which can exceed the 5s default.
  expect: { timeout: 15_000 },
  // Sign in once (tests/e2e/global-setup.ts) instead of every spec file
  // repeating its own sign-in — see that file for why (auth rate limiting).
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    // Every test starts already signed in as the demo user. The handful of
    // tests that specifically need to start signed OUT (the sign-in/sign-out
    // flow itself, the "redirects when unauthenticated" check) override this
    // per-test with `test.use({ storageState: { cookies: [], origins: [] } })`.
    storageState: AUTH_STATE_PATH,
    launchOptions: {
      executablePath: CHROMIUM_PATH,
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

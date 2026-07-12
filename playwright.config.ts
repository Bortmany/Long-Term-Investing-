import { defineConfig } from "@playwright/test";

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
  use: {
    baseURL: "http://localhost:3000",
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

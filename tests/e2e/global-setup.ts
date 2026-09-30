import { request as playwrightRequest } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  E2E_BASE_URL,
  E2E_USER_EMAIL,
  E2E_USER_PASSWORD,
  assertLocalTestDatabase,
} from "./test-user";

// Set up the e2e run ONCE:
//   1. Safety guard — refuse unless the database is on this machine and
//      NODE_ENV isn't production (the next step creates a login with a known
//      password).
//   2. Create the test's own login (e2e-test@investiq.test, see test-user.ts)
//      with its email already confirmed, through Better Auth's own internals
//      on the server side — so it never goes through the public sign-up
//      endpoint, can't trip the sign-up rate limit across repeated runs,
//      and doesn't depend on SIGNUPS_PAUSED or email being set up.
//   3. Give it the same sample portfolio the demo login gets
//      (seedDemoDataForUser in prisma/seed-demo.ts).
//   4. Sign in once over HTTP and save the session cookie to disk, so every
//      spec starts signed in instead of repeating its own sign-in (8 files
//      doing real sign-ins would exceed AUTH_RATE_LIMIT's 10 a minute — see
//      https://playwright.dev/docs/auth for the pattern).
//
// Path note: this file is plain CommonJS-mode TypeScript (package.json has
// no "type": "module"), so it avoids `import.meta`. `process.cwd()` is safe
// because `npm run test:e2e` always runs from the repo root.
const CREATE_USER_SCRIPT = path.join(process.cwd(), "tests", "e2e", "create-test-user.ts");
export const AUTH_STATE_PATH = path.join(process.cwd(), "tests", "e2e", ".auth", "user.json");

export default async function globalSetup(): Promise<void> {
  mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });

  assertLocalTestDatabase(process.env);

  // Run the user-creation step in its own process under tsx: it needs Better
  // Auth, which Playwright's TypeScript loader can't load. The password goes
  // through the environment, never the command line.
  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), CREATE_USER_SCRIPT],
    {
      cwd: process.cwd(),
      env: { ...process.env, E2E_TEST_PASSWORD: E2E_USER_PASSWORD },
      encoding: "utf8",
    },
  );
  if (result.error || result.status !== 0) {
    const detail =
      (result.stderr || "").trim() || (result.stdout || "").trim() || result.error?.message || "";
    throw new Error(`E2E setup: creating the test user failed. ${detail}`);
  }

  const context = await playwrightRequest.newContext({ baseURL: E2E_BASE_URL });
  const response = await context.post("/api/auth/sign-in/email", {
    data: { email: E2E_USER_EMAIL, password: E2E_USER_PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(
      `E2E auth setup: sign-in as ${E2E_USER_EMAIL} failed with status ${response.status()}.`,
    );
  }

  await context.storageState({ path: AUTH_STATE_PATH });
  await context.dispose();
}

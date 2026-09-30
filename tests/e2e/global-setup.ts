import { request as playwrightRequest } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  E2E_BASE_URL,
  E2E_USER_EMAIL,
  E2E_USER_NAME,
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
export const AUTH_STATE_PATH = path.join(process.cwd(), "tests", "e2e", ".auth", "user.json");

export default async function globalSetup(): Promise<void> {
  mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });

  assertLocalTestDatabase(process.env);

  const { PrismaClient } = await import("@prisma/client");
  const { ensureVerifiedPasswordUser, seedDemoDataForUser } = await import("../../prisma/seed-demo");
  const prisma = new PrismaClient();
  try {
    const user = await ensureVerifiedPasswordUser(prisma, {
      email: E2E_USER_EMAIL,
      name: E2E_USER_NAME,
      password: E2E_USER_PASSWORD,
      // Keep the stored password in step with E2E_TEST_PASSWORD between runs.
      resetPassword: true,
    });
    await seedDemoDataForUser(prisma, user.id);
  } finally {
    await prisma.$disconnect();
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

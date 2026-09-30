// Standalone step run by global-setup.ts as a child process (via `tsx`).
// It lives outside Playwright's own TypeScript loader because it imports
// Better Auth (through prisma/seed-demo.ts), which that loader can't load.
//
// Creates the e2e login (email confirmed, plan PRO with no subscription row)
// and gives it the demo portfolio. Reads the password from the environment
// (E2E_TEST_PASSWORD) — never from the command line. Exits non-zero with a
// plain message on any failure, including the local-database safety guard.

import { PrismaClient } from "@prisma/client";

import { ensureVerifiedPasswordUser, seedDemoDataForUser } from "../../prisma/seed-demo";
import {
  E2E_USER_EMAIL,
  E2E_USER_NAME,
  E2E_USER_PASSWORD,
  assertLocalTestDatabase,
} from "./test-user";

async function main(): Promise<void> {
  assertLocalTestDatabase(process.env);

  const prisma = new PrismaClient();
  try {
    const user = await ensureVerifiedPasswordUser(prisma, {
      email: E2E_USER_EMAIL,
      name: E2E_USER_NAME,
      password: E2E_USER_PASSWORD,
      // Keep the stored password in step with E2E_TEST_PASSWORD between runs.
      resetPassword: true,
      // The specs exercise Pro screens. Owner-granted Pro, no subscription
      // row — same as plan:set.
      plan: "PRO",
    });
    await seedDemoDataForUser(prisma, user.id);
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);

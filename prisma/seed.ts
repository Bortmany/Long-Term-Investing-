// Seed data for InvestIQ AI.
//
// PRODUCTION (NODE_ENV="production"): only the shared reference data —
// instruments, sample prices and sample FX rates, all labelled "sample
// data". NO demo login and nothing that hangs off one (portfolio,
// transactions, watchlist, thesis, alert), so a known login can never exist
// on the live site. SEED_DEMO_PASSWORD is never asked for there.
//
// ANYWHERE ELSE (local development): the same reference data plus the demo
// login owner@example.com — email already confirmed, so it can sign in even
// when email is set up locally — with its sample portfolio.
//
// Safe to rerun. The demo content itself lives in prisma/seed-demo.ts so the
// end-to-end test setup can reuse it.

// Load .env when run directly with tsx (prisma db seed already provides env).
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

import { PrismaClient } from "@prisma/client";

import {
  ensureVerifiedPasswordUser,
  isProductionSeed,
  seedDemoDataForUser,
  seedReferenceData,
} from "./seed-demo";

const prisma = new PrismaClient();

const DEMO_EMAIL = "owner@example.com";

// The demo login's password comes from SEED_DEMO_PASSWORD — there is NO
// built-in default on purpose, so a guessable demo account (the old
// hardcoded "investiq-demo") can't be created by accident.
function assertStrongDemoPassword(pw: string | undefined): asserts pw is string {
  if (!pw || pw.length < 12 || pw === "investiq-demo") {
    throw new Error(
      "Set a strong SEED_DEMO_PASSWORD in your .env before seeding the demo " +
        "account — at least 12 characters, and not the old \"investiq-demo\" " +
        "default.",
    );
  }
}

async function main() {
  if (isProductionSeed()) {
    const reference = await seedReferenceData(prisma);
    console.log("Seed complete (production: shared reference data only, no demo login):");
    console.log(`  instruments:  ${reference.instrumentCount}`);
    console.log(`  seed prices:  ${reference.priceCount}, fx rates: ${reference.fxCount}`);
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  // Only a NEW demo user needs the password (rerunning on an existing
  // database doesn't).
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!existing) assertStrongDemoPassword(password);

  const user = await ensureVerifiedPasswordUser(prisma, {
    email: DEMO_EMAIL,
    name: "Demo Owner",
    password: password ?? "",
  });
  console.log(user.created ? `Created demo user ${DEMO_EMAIL}.` : `Demo user ${DEMO_EMAIL} already exists.`);

  const demo = await seedDemoDataForUser(prisma, user.id);

  console.log("Seed complete:");
  // Never print the password — it's the one you set in SEED_DEMO_PASSWORD.
  console.log(`  user:         ${DEMO_EMAIL} (email confirmed; password: the SEED_DEMO_PASSWORD you set)`);
  console.log(`  portfolio:    ${demo.portfolioName} (base OMR)`);
  console.log(`  transactions: ${demo.transactionCount}`);
  console.log(`  watchlist:    1 item (JNJ — watched, not held)`);
  console.log(`  theses:       1 active (MSFT)`);
  console.log(`  alerts:       1 paused (AAPL price alert — sample data, honestly ignored)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// Give someone Pro (or put them back on Free) by hand, while payments are
// switched off — the owner's tool from go-public spec B6.
//
//   npm run plan:set -- --email someone@example.com --plan PRO
//   npm run plan:set -- --email someone@example.com --plan FREE
//
// It reads DATABASE_URL from .env (or from the environment, so it can be
// pointed at the live database from the host's shell). It refuses an unknown
// email, and refuses a user whose plan is owned by a Stripe subscription
// unless you add --force. It never touches passwords, never prints secrets,
// and makes no network calls other than to the database.

// Load .env when present (the same way prisma/seed.ts does).
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

import { PrismaClient } from "@prisma/client";
import { parseSetPlanArgs, setPlanByEmail } from "../src/lib/billing/set-plan";

async function main(): Promise<number> {
  const args = parseSetPlanArgs(process.argv.slice(2));
  if ("error" in args) {
    console.error(args.error);
    return 1;
  }

  const prisma = new PrismaClient();
  try {
    const result = await setPlanByEmail(
      {
        findUserByEmail: (email) =>
          prisma.user.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
            select: {
              id: true,
              email: true,
              plan: true,
              subscription: { select: { providerSubscriptionId: true, status: true } },
            },
          }),
        updatePlan: async (userId, plan) => {
          await prisma.user.update({ where: { id: userId }, data: { plan } });
        },
      },
      args,
    );

    if (!result.ok) {
      console.error(result.message);
      return 1;
    }
    if (result.warning) console.warn(`Warning: ${result.warning}`);
    if (result.oldPlan === result.newPlan) {
      console.log(`${result.email} was already on ${result.newPlan}. Nothing needed changing.`);
    } else {
      console.log(`Changed ${result.email}: ${result.oldPlan} -> ${result.newPlan}.`);
    }
    return 0;
  } catch (error) {
    // The message only — never the connection string.
    console.error(
      "Could not update the plan: the database could not be reached or refused the change.",
      error instanceof Error ? `(${error.name})` : "",
    );
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((code) => {
  process.exitCode = code;
});

import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

// The demo login's password is never hardcoded — it comes from the same
// SEED_DEMO_PASSWORD the seed script used (same idiom as theses.spec.ts).
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;
const CRON_SECRET = process.env.CRON_SECRET;
const DEMO_EMAIL = "owner@example.com";

// One test below needs a review that ALREADY EXISTS while AI is switched off
// — a state the UI can't reach on its own (generating one needs the very key
// that's missing), so this file writes the row straight to the database and
// removes it again afterwards. The only e2e spec that touches Prisma, and
// only for that reason.
const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** A minimal but schema-valid stored weekly review. */
const STORED_REVIEW_OUTPUT = {
  summary: "Test review: the portfolio held steady this week.",
  newRisks: [],
  improvedHoldings: [],
  weakenedHoldings: [],
  allocationDrift: "No meaningful drift this week.",
  suggestedActions: [],
  behavioralNote: "Nothing to act on — sitting still is a decision too.",
};

// Every test starts already signed in as the demo user — see
// tests/e2e/global-setup.ts. No per-file sign-in helper anymore.

test("shows the honest no-key state on /reviews, with no run button", async ({ page }) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set SEED_DEMO_PASSWORD in .env (the one used when seeding) to run this test",
  );

  await page.goto("/reviews");
  await expect(page.getByRole("heading", { name: "Reviews" })).toBeVisible();

  // No ANTHROPIC_API_KEY in this test environment — the header's "Run weekly
  // review" trigger is hidden entirely (ui-spec §2.5/§7.1's standard no-key
  // page pattern) and a first-class ConnectKeyNotice explains why, never a
  // faked review.
  await expect(page.getByText("AI features are turned off")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run weekly review" })).toHaveCount(0);
});

test("a review already saved still shows with no key — only the run button is off", async ({
  page,
}) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set SEED_DEMO_PASSWORD in .env (the one used when seeding) to run this test",
  );

  // A review saved in the database must never be hidden behind the no-key
  // notice (docs/CONVENTIONS.md, AI rules): the honest thing is to show the
  // real saved work and switch off only what can't run.
  const user = await prisma.user.findFirst({ where: { email: DEMO_EMAIL } });
  test.skip(!user, `Demo user ${DEMO_EMAIL} not found — run \`npx prisma db seed\` first`);

  const period = "1999-W01"; // far in the past, so it can't collide with a real one
  const review = await prisma.weeklyReview.create({
    data: { userId: user!.id, period, output: STORED_REVIEW_OUTPUT },
  });

  try {
    await page.goto("/reviews");

    // The saved review is listed, summary and all.
    const row = page.getByRole("row", { name: /1999/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Test review: the portfolio held steady this week.")).toBeVisible();

    // The trigger is present but disabled, with the notice explaining why.
    const runButton = page.getByRole("button", { name: "Run weekly review" });
    await expect(runButton).toBeVisible();
    await expect(runButton).toBeDisabled();
    await expect(page.getByText("AI features are turned off")).toBeVisible();
  } finally {
    // Always clean up, even if an assertion above failed — otherwise the row
    // leaks into the next run and breaks the empty-state test above.
    await prisma.weeklyReview.delete({ where: { id: review.id } });
  }
});

test("the scheduled cron route answers 503 dormant without CRON_SECRET configured", async ({
  request,
}) => {
  // This test needs CRON_SECRET UNSET to exercise the dormant path — the
  // opposite requirement from alerts.spec.ts's cron test, which needs it
  // set. Both tests share this repo's one .env, so only one precondition
  // can hold at a time; skip rather than assert a false failure either way.
  test.skip(
    Boolean(CRON_SECRET),
    "CRON_SECRET is configured in .env (needed by alerts.spec.ts) — unset it to run this dormant-path test",
  );
  const response = await request.post("/api/cron/weekly-review");
  expect(response.status()).toBe(503);
  const body = await response.json();
  expect(body.status).toBe("dormant");
  expect(typeof body.message).toBe("string");
});

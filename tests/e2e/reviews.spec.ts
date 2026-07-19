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

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill(DEMO_PASSWORD!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("shows the honest no-key state on /reviews, with no run button", async ({ page }) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set SEED_DEMO_PASSWORD in .env (the one used when seeding) to run this test",
  );
  await signIn(page);

  await page.goto("/reviews");
  await expect(page.getByRole("heading", { name: "Reviews" })).toBeVisible();

  // No ANTHROPIC_API_KEY in this test environment — the header's "Run weekly
  // review" trigger is hidden entirely (ui-spec §2.5/§7.1's standard no-key
  // page pattern) and a first-class ConnectKeyNotice explains why, never a
  // faked review.
  await expect(page.getByText("AI features are turned off")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run weekly review" })).toHaveCount(0);
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

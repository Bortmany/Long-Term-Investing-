import { expect, test } from "@playwright/test";

// The demo login's password is never hardcoded — it comes from the same
// SEED_DEMO_PASSWORD the seed script used (same idiom as theses.spec.ts).
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill(DEMO_PASSWORD!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("the picker is honest about no API key, and a mode+instrument URL pre-selects both", async ({
  page,
}) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set SEED_DEMO_PASSWORD in .env (the one used when seeding) to run this test",
  );
  await signIn(page);

  await page.goto("/committee");
  await expect(page.getByRole("heading", { name: "Investment Committee", level: 1 })).toBeVisible();

  // Pick a seeded, held instrument (AAPL, seeded in prisma/seed.ts) from the
  // picker — the same instrument option format New Thesis uses.
  await page.getByLabel("Instrument").selectOption({ label: "AAPL — Apple Inc." });
  await expect(page).toHaveURL(/\?instrument=.+&mode=committee/);

  // No ANTHROPIC_API_KEY in this test environment — the picker's mode
  // switcher is hidden and a first-class ConnectKeyNotice shows instead of
  // any AI trigger or output, never a faked verdict. (Both the picker card
  // and the Committee AiPanel below show their own copy of this notice, so
  // assert on the first match.)
  await expect(page.getByText("AI features are turned off").first()).toBeVisible();

  // Pull the real instrument id InvestIQ just navigated to, then visit the
  // exact deep link the Portfolio holdings row's "Sell analysis" action uses
  // (?instrument=<id>&mode=sell) and confirm both arrive pre-selected.
  const url = new URL(page.url());
  const instrumentId = url.searchParams.get("instrument");
  expect(instrumentId).toBeTruthy();

  await page.goto(`/committee?instrument=${instrumentId}&mode=sell`);
  await expect(page).toHaveURL(new RegExp(`instrument=${instrumentId}&mode=sell`));
  await expect(page.getByRole("heading", { name: "Sell Analysis" })).toBeVisible();
  // Still an honest no-key state on this deep-linked mode too.
  await expect(page.getByText("AI features are turned off").first()).toBeVisible();
});

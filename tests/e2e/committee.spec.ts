import { expect, test } from "@playwright/test";
import { E2E_USER_PASSWORD } from "./test-user";

// The e2e test login (tests/e2e/test-user.ts) is never hardcoded here — its
// password comes from E2E_TEST_PASSWORD (same idiom as theses.spec.ts).
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

const DEMO_PASSWORD = E2E_USER_PASSWORD;

// Every test starts already signed in as the e2e test user — see
// tests/e2e/global-setup.ts. No per-file sign-in helper anymore.

test("the picker is honest about no API key, and a mode+instrument URL pre-selects both", async ({
  page,
}) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set E2E_TEST_PASSWORD in .env to run this test",
  );

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
  // exact deep link the Portfolio holdings row's "Downside check" action uses
  // (?instrument=<id>&mode=sell) and confirm both arrive pre-selected.
  const url = new URL(page.url());
  const instrumentId = url.searchParams.get("instrument");
  expect(instrumentId).toBeTruthy();

  await page.goto(`/committee?instrument=${instrumentId}&mode=sell`);
  await expect(page).toHaveURL(new RegExp(`instrument=${instrumentId}&mode=sell`));
  await expect(page.getByRole("heading", { name: "Downside check" })).toBeVisible();
  // Still an honest no-key state on this deep-linked mode too.
  await expect(page.getByText("AI features are turned off").first()).toBeVisible();
});

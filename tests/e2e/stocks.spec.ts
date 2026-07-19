import { expect, test } from "@playwright/test";

// The demo login's password is never hardcoded — it comes from the same
// SEED_DEMO_PASSWORD the seed script used (same idiom as portfolio.spec.ts).
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;

// Every test starts already signed in as the demo user — see
// tests/e2e/global-setup.ts. No per-file sign-in helper anymore.

test("shows held and watched stocks, and a stock's detail page renders honest unavailable states", async ({
  page,
}) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set SEED_DEMO_PASSWORD in .env (the one used when seeding) to run this test",
  );

  await page.goto("/stocks");
  await expect(page.getByRole("heading", { name: "Stocks" })).toBeVisible();

  // AAPL is held (prisma/seed.ts BUY transaction); JNJ is watched only.
  const aaplRow = page.getByRole("row", { name: /AAPL/ });
  await expect(aaplRow).toBeVisible();
  await expect(aaplRow.getByText("Held")).toBeVisible();

  const jnjRow = page.getByRole("row", { name: /JNJ/ });
  await expect(jnjRow).toBeVisible();
  await expect(jnjRow.getByText("Held")).toHaveCount(0);

  await aaplRow.getByRole("link", { name: "AAPL" }).click();
  await expect(page).toHaveURL(/\/stocks\//);

  // Profile header — plain instrument data (never AI-generated), so it
  // renders regardless of any API key.
  await expect(page.getByRole("heading", { name: "AAPL" })).toBeVisible();
  await expect(page.getByText("Apple Inc.")).toBeVisible();
  await expect(page.getByText("Technology")).toBeVisible();

  // No FMP_API_KEY in this environment: an AAPL (US) instrument routes to
  // the manual provider, so statements and dividend history are honestly
  // unavailable — never a fabricated table or a fake number.
  await expect(
    page.getByText(
      "Financial statements require a live market-data connection for this instrument.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Dividend history requires a live market-data connection for this instrument.",
    ),
  ).toBeVisible();

  // Every ratio strip tile fails independently — with no statements to draw
  // from, each one honestly says "Unavailable" rather than showing a 0.
  await expect(page.getByText("Unavailable").first()).toBeVisible();

  // No ANTHROPIC_API_KEY in this environment: both AI panels on this page
  // (Health Score and, since Phase 6, Recent News) independently show the
  // first-class ConnectKeyNotice, never a faked AI score or summary — so
  // the same heading legitimately appears twice; `.first()` matches the
  // existing "Unavailable" ratio-tile check above.
  await expect(page.getByText("AI features are turned off").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Health Score" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent News" })).toBeVisible();
});

test("the watch star toggles a stock in and out of the watchlist", async ({ page }) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set SEED_DEMO_PASSWORD in .env (the one used when seeding) to run this test",
  );

  await page.goto("/stocks");

  // AAPL is held but not watched at the start of this test.
  const watchButton = page.getByRole("button", { name: "Watch AAPL" });
  await expect(watchButton).toBeVisible();
  await watchButton.click();

  const unwatchButton = page.getByRole("button", { name: "Stop watching AAPL" });
  await expect(unwatchButton).toBeVisible();
  await unwatchButton.click();

  await expect(page.getByRole("button", { name: "Watch AAPL" })).toBeVisible();
});

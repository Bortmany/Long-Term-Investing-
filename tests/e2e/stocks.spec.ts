import { expect, test } from "@playwright/test";
import { E2E_USER_PASSWORD } from "./test-user";

// The e2e test login (tests/e2e/test-user.ts) is never hardcoded here — its
// password comes from E2E_TEST_PASSWORD (same idiom as portfolio.spec.ts).
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

const DEMO_PASSWORD = E2E_USER_PASSWORD;

// Every test starts already signed in as the e2e test user — see
// tests/e2e/global-setup.ts. No per-file sign-in helper anymore.

test("shows held and watched stocks, and a stock's detail page renders honest unavailable states", async ({
  page,
}) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set E2E_TEST_PASSWORD in .env to run this test",
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
    "Set E2E_TEST_PASSWORD in .env to run this test",
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

test("clicking anywhere on a row opens the stock, but the watch star does not", async ({
  page,
}) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set E2E_TEST_PASSWORD in .env to run this test",
  );

  await page.goto("/stocks");
  const aaplRow = page.getByRole("row", { name: /AAPL/ });
  await expect(aaplRow).toBeVisible();

  // The star is its own button: pressing it must NOT also open the stock.
  await aaplRow.getByRole("button", { name: /AAPL/ }).click();
  await expect(page.getByRole("button", { name: "Stop watching AAPL" })).toBeVisible();
  await expect(page).toHaveURL(/\/stocks$/);
  // Put the star back the way it was.
  await page.getByRole("button", { name: "Stop watching AAPL" }).click();
  await expect(page.getByRole("button", { name: "Watch AAPL" })).toBeVisible();
  await expect(page).toHaveURL(/\/stocks$/);

  // A click on plain row space (the Name cell, not the ticker link) opens it.
  // Clicked by coordinates because the row's invisible link layer sits on top.
  const nameCell = aaplRow.getByRole("cell").nth(1);
  const box = await nameCell.boundingBox();
  if (!box) throw new Error("The Name cell has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page).toHaveURL(/\/stocks\/.+/);
  await expect(page.getByRole("heading", { name: "AAPL" })).toBeVisible();
});

test("un-watching shows an Undo and Undo puts the stock back", async ({ page }) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set E2E_TEST_PASSWORD in .env to run this test",
  );

  await page.goto("/stocks");

  // JNJ is watched only (not held), so its row leaves the list once removed —
  // the toast must stay on screen anyway because it lives in the layout.
  await page.getByRole("button", { name: "Stop watching JNJ" }).click();
  await expect(page.getByText("JNJ removed from your watchlist")).toBeVisible();
  await expect(page.getByRole("row", { name: /JNJ/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Undo removing JNJ" }).click();
  await expect(page.getByText("JNJ is back on your watchlist")).toBeVisible();

  // Back on Stocks and on Watchlist.
  await page.reload();
  await expect(page.getByRole("row", { name: /JNJ/ })).toBeVisible();
  await page.goto("/watchlist");
  await expect(page.getByRole("row", { name: /JNJ/ })).toBeVisible();
});

test("Track a Stock on a ticker InvestIQ already has adds it with no error", async ({
  page,
}) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set E2E_TEST_PASSWORD in .env to run this test",
  );

  await page.goto("/stocks");

  // Un-watch JNJ and let the Undo go (the exact September scenario).
  await page.getByRole("button", { name: "Stop watching JNJ" }).click();
  await expect(page.getByText("JNJ removed from your watchlist")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("JNJ removed from your watchlist")).toHaveCount(0);

  await page.getByRole("button", { name: "Track a Stock" }).click();
  await page.getByLabel("Ticker").fill("JNJ");
  await page.getByLabel("Market").selectOption("US");
  await page.getByLabel("Name", { exact: true }).fill("Johnson & Johnson");
  await page.getByRole("button", { name: "Add to watchlist" }).click();

  await expect(page.getByText("JNJ added to your watchlist.")).toBeVisible();
  // No error, and the old sentence is gone from the app.
  await expect(page.getByText(/already tracked/i)).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("row", { name: /JNJ/ })).toBeVisible();
});

test("clicking a source badge on a /stocks row does not open the stock", async ({ page }) => {
  test.skip(!DEMO_PASSWORD, "Set E2E_TEST_PASSWORD in .env to run this test");

  await page.goto("/stocks");
  const aaplRow = page.getByRole("row", { name: /AAPL/ });
  await expect(aaplRow).toBeVisible();

  // The badge sits above the row's stretched link layer, so pressing it must
  // show its explanation instead of navigating to the stock page.
  // The compact badge is a focusable span (data-slot="tooltip-trigger") with an
  // aria-label, not a <button>; the first one in the row is the quote cell's.
  const badge = aaplRow.locator('[data-slot="tooltip-trigger"]').first();
  await badge.click();
  await expect(page).toHaveURL(/\/stocks(\?.*)?$/);
});

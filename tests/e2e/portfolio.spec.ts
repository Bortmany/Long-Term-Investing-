import { expect, test } from "@playwright/test";
import { E2E_USER_PASSWORD } from "./test-user";

// The e2e test login (tests/e2e/test-user.ts) is never hardcoded here — its
// password comes from E2E_TEST_PASSWORD. Load .env so the test sees it
// (same idiom as smoke.spec.ts).
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

const DEMO_PASSWORD = E2E_USER_PASSWORD;

test("adding a Buy transaction changes the dashboard's Total Portfolio Value", async ({
  page,
}) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set E2E_TEST_PASSWORD in .env to run this test",
  );

  // Every test starts already signed in as the e2e test user — see
  // tests/e2e/global-setup.ts.
  await page.goto("/dashboard");

  // Read the Total Portfolio Value card before adding anything.
  const totalValueCard = page.getByText("Total Portfolio Value").locator("..");
  const totalBefore = await totalValueCard.getByText(/^OMR /).innerText();

  // Open the Add Transaction dialog from /portfolio (the page header has the
  // one primary "Add Transaction" button; the Transactions card offers a
  // ghost "+ Add" — either opens the same dialog).
  await page.goto("/portfolio");
  await page.getByRole("button", { name: "Add Transaction" }).first().click();

  const dialog = page.getByRole("dialog", { name: "Add Transaction" });
  await expect(dialog).toBeVisible();

  // Type defaults to Buy. Pick a seeded instrument (AAPL) and fill the trade —
  // Amount is never typed in; it's the computed read-only line below the fields.
  const instrumentSelect = dialog.getByLabel("Instrument");
  const aaplValue = await instrumentSelect
    .locator("option", { hasText: "AAPL" })
    .getAttribute("value");
  await instrumentSelect.selectOption(aaplValue!);
  await dialog.getByLabel("Quantity").fill("2");
  await dialog.getByLabel("Price per unit").fill("100");
  await dialog.getByLabel("Fee").fill("1");
  // The computed Amount line shows the transaction's OWN currency (defaults
  // to the instrument's currency), matching the Transactions table and the
  // ui-spec — never the portfolio's base currency, since this preview isn't
  // FX-converted. AAPL is seeded as a USD instrument (prisma/seed.ts).
  await expect(dialog.getByText(/^Amount: USD /)).toBeVisible();

  await dialog.getByRole("button", { name: "Add Transaction" }).click();
  await expect(dialog).toBeHidden();

  // Back on the dashboard, the total should have moved from the fee alone
  // (a pure cash outflow with no matching market-value increase) even before
  // considering any price difference from the instrument's cached price.
  await page.goto("/dashboard");
  const totalAfter = await page
    .getByText("Total Portfolio Value")
    .locator("..")
    .getByText(/^OMR /)
    .innerText();

  expect(totalAfter).not.toBe(totalBefore);
});

// ---------------------------------------------------------------------------
// Phone viewport (390 x 844): the holdings are readable cards, not a table
// that hides the money. Core-guarantee check: a quantity must never be cut
// ("3,0" for 3,000 shares was a wrong number on screen). The long sweep of
// every screen lives in phone-layout.spec.ts; this is the portfolio's own
// "done when" from phone-tables-as-cards.md.
// ---------------------------------------------------------------------------
test.describe("phone viewport", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("holdings show value and gain with no sideways scroll, and the quantity is whole", async ({
    page,
  }) => {
    test.skip(
      !DEMO_PASSWORD,
      "Set E2E_TEST_PASSWORD in .env to run this test",
    );

    await page.goto("/portfolio");
    const cards = page.getByRole("list", { name: "Holdings", exact: true }).locator(":scope > li");
    await expect(cards.first()).toBeVisible();

    // The page itself does not scroll sideways.
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(390);

    // The 3,000-share holding (Bank Muscat) reads "3,000" in full.
    const bkmb = cards.filter({ hasText: "BKMB" });
    const quantity = bkmb.locator('[data-figure][title="3,000 shares"]');
    await expect(quantity).toHaveText("3,000");
    const fits = await quantity.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      right: node.getBoundingClientRect().right,
    }));
    expect(fits.scrollWidth).toBeLessThanOrEqual(fits.clientWidth + 1);
    expect(fits.right).toBeLessThanOrEqual(390);

    // Market value and gain/loss are on screen for this holding, no scrolling.
    const figures = bkmb.locator("[data-figure]");
    expect(await figures.count()).toBeGreaterThanOrEqual(3);
    for (const figure of await figures.all()) {
      await expect(figure).toBeVisible();
      const box = await figure.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    }

    // The table version is not on screen at the same time.
    await expect(page.getByRole("table").first()).toBeHidden();
  });
});

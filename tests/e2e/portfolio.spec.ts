import { expect, test } from "@playwright/test";

// The demo login's password is never hardcoded — it comes from the same
// SEED_DEMO_PASSWORD the seed script used. Load .env so the test sees it
// (same idiom as smoke.spec.ts).
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;

test("adding a Buy transaction changes the dashboard's Total Portfolio Value", async ({
  page,
}) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set SEED_DEMO_PASSWORD in .env (the one used when seeding) to run this test",
  );

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill(DEMO_PASSWORD!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Read the Total Portfolio Value card before adding anything.
  const totalValueCard = page.getByText("Total Portfolio Value").locator("..");
  const totalBefore = await totalValueCard.getByText(/^OMR /).innerText();

  // Open the Add Transaction dialog from /portfolio (two "Add Transaction"
  // buttons exist on a populated portfolio — page header and Transactions
  // card header — either opens the same dialog).
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

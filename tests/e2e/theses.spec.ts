import { expect, test } from "@playwright/test";

// End-to-end: creating a thesis on /theses actually persists and shows up
// in the Active list (mirrors tests/e2e/portfolio.spec.ts's sign-in +
// dialog-interaction style).
test("creating a new thesis shows it in the Active list", async ({ page }) => {
  // Sign in as the seeded demo owner.
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("investiq-demo");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/theses");
  await page.getByRole("button", { name: "New Thesis" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // The Select's option labels are "TICKER — Name"; pick whichever option
  // contains AAPL rather than assuming an exact label string.
  const instrumentSelect = dialog.getByLabel("Instrument");
  const optionLabels = await instrumentSelect.locator("option").allTextContents();
  const aaplIndex = optionLabels.findIndex((label) => label.includes("AAPL"));
  expect(aaplIndex).toBeGreaterThan(-1);
  await instrumentSelect.selectOption({ index: aaplIndex });

  const statement =
    "Durable ecosystem and pricing power should keep margins strong for years.";
  await dialog.getByLabel("Statement").fill(statement);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();

  // The Active filter chip is selected by default, and the new thesis's
  // ticker + statement snippet should be visible in the table.
  await expect(page.locator("td", { hasText: "AAPL" }).first()).toBeVisible();
  await expect(
    page.locator("td", { hasText: "Durable ecosystem and pricing power" }).first(),
  ).toBeVisible();
});

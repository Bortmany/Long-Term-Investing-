import { expect, test } from "@playwright/test";

// End-to-end: adding a transaction on /portfolio really changes the
// portfolio math the Dashboard shows. A DEPOSIT is used because it moves the
// total by exactly the deposited amount — deterministic, no prices involved.
test("adding a deposit on /portfolio changes the dashboard total", async ({
  page,
}) => {
  // Sign in as the seeded demo owner.
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("investiq-demo");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Read the Total Portfolio Value before (the label's sibling is the value).
  const totalValue = page
    .locator("p", { hasText: /^Total Portfolio Value$/ })
    .locator("xpath=following-sibling::p[1]");
  await expect(totalValue).toBeVisible();
  const before = (await totalValue.textContent())?.trim();
  expect(before).toBeTruthy();

  // Add a DEPOSIT on /portfolio (base currency OMR is the dialog default).
  await page.goto("/portfolio");
  await page
    .getByRole("button", { name: "Add Transaction" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Type").selectOption("DEPOSIT");
  await dialog.getByLabel("Amount").fill("123.456");
  await dialog.getByRole("button", { name: "Add Transaction" }).click();
  await expect(dialog).toBeHidden();

  // The new deposit shows up in the Transactions table (newest first).
  await expect(
    page.locator("td", { hasText: "OMR 123.456" }).first(),
  ).toBeVisible();

  // Back on the dashboard, the total must have moved by the deposit.
  await page.goto("/dashboard");
  await expect(totalValue).toBeVisible();
  await expect(totalValue).not.toHaveText(before as string);
});

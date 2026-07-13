import { expect, test } from "@playwright/test";

test("thesis detail page renders for seeded MSFT thesis", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("investiq-demo");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/theses");
  await page.getByRole("cell", { name: /MSFT/ }).first().click();
  await expect(page).toHaveURL(/\/theses\/.+/);
  await expect(page.getByText("Latest Check")).toBeVisible();
  await expect(page.getByText("AI features are turned off")).toBeVisible();
  await expect(page.getByText("← All Theses")).toBeVisible();
});

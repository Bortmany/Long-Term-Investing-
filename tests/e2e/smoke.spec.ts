import { expect, test } from "@playwright/test";

test("health endpoint answers ok with a live database", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(typeof body.db).toBe("boolean");
});

test("unauthenticated visitors are redirected to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});

test("demo user can sign in and sign out", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("investiq-demo");
  await page.getByRole("button", { name: /^sign in$/i }).click();

  // Signing in lands on the dashboard; the sidebar shows the user's email.
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("owner@example.com")).toBeVisible();

  // The shell renders a sign-out button per breakpoint; click the visible one.
  await page
    .getByRole("button", { name: /sign out/i })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/sign-in/);
});

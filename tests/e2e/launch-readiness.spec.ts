import { expect, test } from "@playwright/test";

// Same env-loading idiom as smoke.spec.ts — the demo login's password is
// never hardcoded.
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;

// The signed-in tests below start already authenticated as the demo user —
// see tests/e2e/global-setup.ts. These two public-page tests instead force
// an empty (logged-out) session so "renders without signing in" is actually
// exercised, not just true by coincidence.
test.describe("no session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("/privacy renders without signing in", async ({ page }) => {
    const response = await page.goto("/privacy");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  });

  test("/terms renders without signing in", async ({ page }) => {
    const response = await page.goto("/terms");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Terms of Use" })).toBeVisible();
  });
});

test("signed-in Settings shows the data-download control and the delete-account card", async ({
  page,
}) => {
  test.skip(!DEMO_PASSWORD, "Set SEED_DEMO_PASSWORD in .env to run this test");

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Your data" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download my data" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Danger" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete my account" })).toBeVisible();
});

test("GET /api/account/export returns the signed-in user's data as JSON", async ({ page }) => {
  test.skip(!DEMO_PASSWORD, "Set SEED_DEMO_PASSWORD in .env to run this test");

  // page.request shares the browser context's cookies, so this call carries
  // the same session cookie the signed-in page has.
  const response = await page.request.get("/api/account/export");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/json");

  const body = await response.json();
  expect(body.profile.email).toBe("owner@example.com");
});

import { expect, test } from "@playwright/test";

// The demo login's password is never hardcoded — it comes from the same
// SEED_DEMO_PASSWORD the seed script used. Load .env so the test sees it.
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;

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
  test.skip(
    !DEMO_PASSWORD,
    "Set SEED_DEMO_PASSWORD in .env (the one used when seeding) to run the signed-in smoke test",
  );
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill(DEMO_PASSWORD!);
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

test("the explainer tip next to Cash Balance opens a glossary dialog and Escape closes it", async ({
  page,
}) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set SEED_DEMO_PASSWORD in .env (the one used when seeding) to run the signed-in smoke test",
  );
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill(DEMO_PASSWORD!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("button", { name: "What is Cash balance?" }).click();
  const dialog = page.getByRole("dialog", { name: "Cash balance" });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

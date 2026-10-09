import { expect, test } from "@playwright/test";
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from "./test-user";

// The e2e test login (tests/e2e/test-user.ts) is never hardcoded here — its
// password comes from E2E_TEST_PASSWORD. Load .env so the test sees it.
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

const DEMO_PASSWORD = E2E_USER_PASSWORD;

test("health endpoint answers ok with a live database", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(typeof body.db).toBe("boolean");
});

// These tests specifically need to start signed OUT — they check the public
// welcome page, the logged-out redirect, and the real sign-in/sign-out flow —
// so they override the project's default (signed-in) storage state. Every
// other test in this file starts already authenticated as the e2e test user —
// see tests/e2e/global-setup.ts.
test.describe("no session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("signed-out visitors see the welcome page at /", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/sign-in/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Long-term investing, minus the noise." }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  });

  test("signed-out visitors to a protected page are redirected to sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });

  test("demo user can sign in and sign out", async ({ page }) => {
    test.skip(
      !DEMO_PASSWORD,
      "Set E2E_TEST_PASSWORD in .env to run the signed-in smoke test",
    );
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(E2E_USER_EMAIL);
    // exact: the box also has a "Show password" eye button.
    await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD!);
    await page.getByRole("button", { name: /^sign in$/i }).click();

    // Signing in lands on the dashboard; the sidebar shows the user's email.
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText(E2E_USER_EMAIL)).toBeVisible();

    // The shell renders a sign-out button per breakpoint; click the visible one.
    await page
      .getByRole("button", { name: /sign out/i })
      .filter({ visible: true })
      .click();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test("the explainer tip next to Cash Balance opens a glossary dialog and Escape closes it", async ({
  page,
}) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set E2E_TEST_PASSWORD in .env to run the signed-in smoke test",
  );
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "What is Cash balance?" }).click();
  const dialog = page.getByRole("dialog", { name: "Cash balance" });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

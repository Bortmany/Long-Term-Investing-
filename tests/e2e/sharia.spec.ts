import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { E2E_USER_EMAIL, E2E_USER_PASSWORD, assertLocalTestDatabase } from "./test-user";

// Sharia screen end to end. NO real supplier is ever contacted.
//
// How to run it: the dev server needs a stand-in key so screening counts as
// "set up", and a base address that goes nowhere so the background fetch on
// switch-on can never reach a real supplier:
//   MUSAFFA_API_KEY=e2e-fixture-key MUSAFFA_API_BASE_URL=https://127.0.0.1:9 npm run test:e2e
// Without MUSAFFA_API_KEY the spec skips itself. The test login is on Pro
// (tests/e2e/create-test-user.ts). The spec inserts fixture rows straight
// into the LOCAL test database and refuses to run against any other.

try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

const prisma = new PrismaClient();
const FIXTURE_METHOD = "E2E fixture method";

test.describe("Sharia screen", () => {
  test.skip(!E2E_USER_PASSWORD, "Set E2E_TEST_PASSWORD in .env to run this test");
  test.skip(!process.env.MUSAFFA_API_KEY, "Set MUSAFFA_API_KEY=e2e-fixture-key (a stand-in) to run this test");

  let aaplId = "";

  test.beforeAll(async () => {
    assertLocalTestDatabase(process.env);
    const aapl = await prisma.instrument.findFirstOrThrow({ where: { ticker: "AAPL", market: "US" } });
    aaplId = aapl.id;
    const asOf = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await prisma.shariaScreen.upsert({
      where: { instrumentId_source: { instrumentId: aaplId, source: "musaffa" } },
      create: {
        instrumentId: aaplId,
        source: "musaffa",
        verdict: "COMPLIANT",
        methodName: FIXTURE_METHOD,
        methodVersion: "v1",
        asOf,
        fetchedAt: new Date(),
      },
      update: { verdict: "COMPLIANT", methodName: FIXTURE_METHOD, methodVersion: "v1", asOf, fetchedAt: new Date() },
    });
    await prisma.user.update({ where: { email: E2E_USER_EMAIL }, data: { shariaScreenEnabled: false } });
  });

  test.afterAll(async () => {
    await prisma.shariaScreen.deleteMany({ where: { instrumentId: aaplId, source: "musaffa", methodName: FIXTURE_METHOD } });
    await prisma.user.update({ where: { email: E2E_USER_EMAIL }, data: { shariaScreenEnabled: false } });
    await prisma.$disconnect();
  });

  test("off by default: no badge anywhere; on shows badges; off hides them again", async ({ page }) => {
    // Off: nothing on Holdings or the stock page.
    await page.goto("/portfolio");
    await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Sharia screen:/ })).toHaveCount(0);

    // Turn it on in Settings.
    await page.goto("/settings");
    const card = page.locator("#sharia-screen");
    await expect(card.getByRole("button", { name: "Off", exact: true })).toHaveAttribute("aria-pressed", "true");
    await card.getByRole("button", { name: "On", exact: true }).click();
    await expect(card.getByText("Saved. The Sharia screen badge is now on.")).toBeVisible();

    // Holdings, Watchlist and the stock page now show a badge for AAPL.
    await page.goto("/portfolio");
    await expect(page.getByRole("button", { name: "Sharia screen: Compliant. Show details." }).first()).toBeVisible();
    await page.goto("/watchlist");
    await expect(page.getByRole("button", { name: /Sharia screen:/ }).first()).toBeVisible();
    await page.goto(`/stocks/${aaplId}`);
    const badge = page.getByRole("button", { name: "Sharia screen: Compliant. Show details." });
    await expect(badge).toBeVisible();

    // Open the detail at phone width: fully on screen, the fixed sentence, closes on a tap outside.
    await page.setViewportSize({ width: 390, height: 844 });
    await badge.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`Screen per ${FIXTURE_METHOD} v1, supplied by Musaffa, checked`);
    await expect(dialog).toContainText("This is an automated screen, not a religious ruling (fatwa).");
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await page.mouse.click(195, 40); // the dark area above the sheet
    await expect(dialog).toHaveCount(0);

    // Off again: every badge is gone.
    await page.goto("/settings");
    await page.locator("#sharia-screen").getByRole("button", { name: "Off", exact: true }).click();
    await expect(page.getByText("Saved. The badge is off and hidden everywhere.")).toBeVisible();
    await page.goto("/portfolio");
    await expect(page.getByRole("button", { name: /Sharia screen:/ })).toHaveCount(0);
    await page.goto(`/stocks/${aaplId}`);
    await expect(page.getByRole("button", { name: /Sharia screen:/ })).toHaveCount(0);
  });
});

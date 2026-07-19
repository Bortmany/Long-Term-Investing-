import { expect, test } from "@playwright/test";

// The demo login's password and the cron bearer secret are never hardcoded —
// they come from .env, same env-loading idiom as smoke.spec.ts.
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;
const CRON_SECRET = process.env.CRON_SECRET;

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill(DEMO_PASSWORD!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Delete every alert row whose accessible name matches `pattern` — used to
 * clear a stale alert a PREVIOUS run of this test left behind. A run that
 * fails before reaching its own end-of-test cleanup (below) leaves a
 * TRIGGERED alert sitting in the demo account forever; without this, every
 * later run would keep failing too. No-op when nothing matches.
 */
async function deleteAllMatchingAlerts(page: import("@playwright/test").Page, pattern: RegExp) {
  let row = page.getByRole("row", { name: pattern }).first();
  while (await row.isVisible().catch(() => false)) {
    await row.getByRole("button", { name: /actions for the bkmb alert/i }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const confirmDialog = page.getByRole("dialog", { name: "Delete alert?" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();
    await expect(confirmDialog).toBeHidden();
    row = page.getByRole("row", { name: pattern }).first();
  }
}

/**
 * Mark any pre-existing notifications read so this run's unread-badge
 * assertions start from a known zero — same reasoning as
 * deleteAllMatchingAlerts: a notification left unread by an earlier failed
 * run would otherwise inflate the count this test checks for "1".
 */
async function markAllNotificationsRead(page: import("@playwright/test").Page) {
  const bellButton = page.getByRole("button", { name: /notifications/i }).filter({ visible: true });
  await bellButton.click();
  const markAllButton = page.getByRole("button", { name: "Mark all read" });
  if (await markAllButton.isEnabled()) {
    await markAllButton.click();
  }
  await page.keyboard.press("Escape");
}

test("a PRICE_ABOVE alert fires once crossed with a manual price, checked via the cron route, and shows up in the bell", async ({
  page,
  request,
}) => {
  test.skip(
    !DEMO_PASSWORD || !CRON_SECRET,
    "Set SEED_DEMO_PASSWORD and CRON_SECRET in .env to run this test",
  );
  await signIn(page);

  // Defensive pre-cleanup (see the two helpers above): start this run from a
  // known-clean slate regardless of how the previous run of this test ended.
  await page.goto("/watchlist");
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  await deleteAllMatchingAlerts(page, /Rises above OMR 0\.350/);
  await markAllNotificationsRead(page);

  // Create a PRICE_ABOVE alert on BKMB (the seeded manual-market instrument —
  // MSX, priced from PriceCache rather than FMP).
  await page.getByRole("button", { name: "New Alert" }).click();

  const alertDialog = page.getByRole("dialog", { name: "New Alert" });
  await expect(alertDialog).toBeVisible();
  await alertDialog.getByLabel("Alert type").selectOption({ label: "Price rises above" });
  await alertDialog.getByLabel("Stock").selectOption({ label: "BKMB — Bank Muscat" });
  await alertDialog.getByLabel("Price (OMR)").fill("0.35");
  await alertDialog.getByRole("button", { name: "Create" }).click();
  await expect(alertDialog).toBeHidden();

  // Cross the threshold with a MANUAL price via the Portfolio Update Price
  // dialog — BKMB's seeded price is sample data, which alerts honestly
  // ignore (docs/CONVENTIONS.md), so this manual entry is what makes the
  // alert eligible to fire at all.
  await page.goto("/portfolio");
  const bkmbRow = page.getByRole("row", { name: /BKMB/ });
  await bkmbRow.getByRole("button", { name: /actions for bkmb/i }).click();
  await page.getByRole("menuitem", { name: "Update price" }).click();

  const priceDialog = page.getByRole("dialog", { name: /Update Price/ });
  await expect(priceDialog).toBeVisible();
  await priceDialog.getByLabel("Price").fill("0.400");
  await priceDialog.getByRole("button", { name: "Save" }).click();
  await expect(priceDialog).toBeHidden();

  // Trigger the scheduled sweep directly, the same way the hourly GitHub
  // Actions schedule would (.github/workflows/check-alerts.yml.example).
  const cronResponse = await request.post("/api/cron/check-alerts", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(cronResponse.ok()).toBe(true);

  // A fresh page load picks up the new notification server-side (the layout
  // fetches unread count + items on every request).
  await page.goto("/watchlist");
  const bellButton = page.getByRole("button", { name: /notifications/i }).filter({ visible: true });
  await expect(bellButton).toBeVisible();
  await expect(bellButton.getByText("1", { exact: true })).toBeVisible();

  await bellButton.click();
  const notificationRow = page.getByText(/BKMB rose above/).first();
  await expect(notificationRow).toBeVisible();
  await notificationRow.click();

  // Marking it read clears the unread badge (optimistic client update).
  await expect(bellButton.getByText("1", { exact: true })).toBeHidden();

  // Clean up after itself: delete the alert this run created so repeated
  // runs don't pile up duplicate BKMB alerts (same reasoning as
  // theses.spec.ts's close-the-thesis cleanup).
  const alertRow = page.getByRole("row", { name: /Rises above OMR 0\.350/ }).first();
  await alertRow.getByRole("button", { name: /actions for the bkmb alert/i }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirmDialog = page.getByRole("dialog", { name: "Delete alert?" });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Delete" }).click();
  await expect(confirmDialog).toBeHidden();
});

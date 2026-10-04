import { expect, test } from "@playwright/test";
import { E2E_USER_PASSWORD } from "./test-user";

// The e2e test login (tests/e2e/test-user.ts) is never hardcoded here — its
// password comes from E2E_TEST_PASSWORD (same idiom as stocks.spec.ts).
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

const DEMO_PASSWORD = E2E_USER_PASSWORD;

// Every test starts already signed in as the e2e test user — see
// tests/e2e/global-setup.ts. No per-file sign-in helper anymore.

test("shows the seeded thesis, creates a new one, and the check panel is honest about no API key", async ({
  page,
}) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set E2E_TEST_PASSWORD in .env to run this test",
  );

  await page.goto("/theses");
  await expect(page.getByRole("heading", { name: "Theses" })).toBeVisible();

  // The seed's ACTIVE MSFT thesis (prisma/seed.ts).
  const msftRow = page.getByRole("row", { name: /MSFT/ });
  await expect(msftRow).toBeVisible();
  await expect(msftRow.getByText("Active")).toBeVisible();

  // Create a new thesis on a different held instrument (AAPL, seeded).
  await page.getByRole("button", { name: "New Thesis" }).click();
  await page.getByLabel("Instrument").selectOption({ label: "AAPL — Apple Inc." });
  await page
    .getByLabel("Statement")
    .fill(
      "Apple's services revenue keeps growing faster than hardware and carries much higher margins, and the buyback keeps shrinking the share count.",
    );
  await page.getByRole("button", { name: "Create" }).click();

  // The dev DB persists across test runs (webServer reuses it, and this
  // test — unlike committee.spec.ts's read-only picker — creates a row), so
  // an AAPL thesis from an earlier run can still be sitting there. Rows are
  // listed newest-first (src/app/(app)/theses/page.tsx orderBy createdAt
  // desc), so the one just created is always the FIRST AAPL match — .first()
  // keeps this deterministic instead of a strict-mode violation when more
  // than one AAPL row exists.
  const aaplRow = page.getByRole("row", { name: /AAPL/ }).first();
  await expect(aaplRow).toBeVisible();
  await expect(aaplRow.getByText("Active")).toBeVisible();

  // Open the detail page and check the honest no-key state — no
  // ANTHROPIC_API_KEY in this environment, so the Latest Check panel shows
  // the first-class ConnectKeyNotice, never a faked integrity score.
  await aaplRow.getByRole("link").click();
  await expect(page).toHaveURL(/\/theses\//);
  await expect(page.getByText("AI features are turned off")).toBeVisible();

  // Clean up after itself: close the thesis this run just created so it
  // drops out of the default Active filter and can't pile up as duplicate
  // AAPL rows for the next run (the accumulation that caused the strict-mode
  // violation above in the first place).
  await page.getByRole("button", { name: "Close Thesis" }).click();
  const confirmDialog = page.getByRole("dialog", { name: "Close this thesis?" });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Close Thesis" }).click();
  await expect(confirmDialog).toBeHidden();
});

// ---------------------------------------------------------------------------
// Phone viewport (390 x 844): each thesis is a card that shows its Status,
// Integrity Score and Last Checked without any sideways scrolling, and a long
// statement is cut to two lines (phone-tables-as-cards.md, "done when").
// The sample data (tests/e2e/phone-seed.ts) adds a 500-character thesis with
// a stored score; the seeded MSFT thesis has never been checked.
// ---------------------------------------------------------------------------
test.describe("phone viewport", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("every thesis card shows status, score and last checked; long statements are cut", async ({
    page,
  }) => {
    test.skip(
      !DEMO_PASSWORD,
      "Set E2E_TEST_PASSWORD in .env to run this test",
    );

    await page.goto("/theses");
    const cards = page.getByRole("list", { name: "Theses", exact: true }).locator(":scope > li");
    await expect(cards.first()).toBeVisible();

    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(390);

    for (const card of await cards.all()) {
      await expect(card).toContainText("Active");
      await expect(card).toContainText("Integrity score");
      await expect(card).toContainText("Last checked");
      const box = await card.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    }

    // The never-checked MSFT thesis says so; the long one shows its score.
    await expect(cards.filter({ hasText: "MSFT" })).toContainText("Never checked");
    const long = cards.filter({ hasText: "ZQLONG" });
    await expect(long).toContainText("72");

    // The 500-character statement is cut to two lines.
    const statement = long.locator("p.line-clamp-2");
    const lines = await statement.evaluate((p) => ({
      lineHeight: parseFloat(getComputedStyle(p).lineHeight),
      clientHeight: p.clientHeight,
      scrollHeight: p.scrollHeight,
    }));
    expect(lines.clientHeight).toBeLessThanOrEqual(lines.lineHeight * 2 + 1);
    expect(lines.scrollHeight).toBeGreaterThan(lines.clientHeight);

    // The Active / Closed chips are thumb-sized.
    for (const name of [/^Active \(/, /^Closed \(/]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    }
  });
});

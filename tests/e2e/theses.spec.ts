import { expect, test } from "@playwright/test";

// The demo login's password is never hardcoded — it comes from the same
// SEED_DEMO_PASSWORD the seed script used (same idiom as stocks.spec.ts).
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill(DEMO_PASSWORD!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("shows the seeded thesis, creates a new one, and the check panel is honest about no API key", async ({
  page,
}) => {
  test.skip(
    !DEMO_PASSWORD,
    "Set SEED_DEMO_PASSWORD in .env (the one used when seeding) to run this test",
  );
  await signIn(page);

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

  const aaplRow = page.getByRole("row", { name: /AAPL/ });
  await expect(aaplRow).toBeVisible();
  await expect(aaplRow.getByText("Active")).toBeVisible();

  // Open the detail page and check the honest no-key state — no
  // ANTHROPIC_API_KEY in this environment, so the Latest Check panel shows
  // the first-class ConnectKeyNotice, never a faked integrity score.
  await aaplRow.getByRole("link").click();
  await expect(page).toHaveURL(/\/theses\//);
  await expect(page.getByText("AI features are turned off")).toBeVisible();
});

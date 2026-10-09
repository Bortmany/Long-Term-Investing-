import { expect, test } from "@playwright/test";

// The public stock pages (public-stock-pages.md, Chunk A acceptance checks):
// what a signed-OUT visitor, or a search engine, can see. These rely on the
// nine sample Instrument rows from the normal seed (prisma/seed-demo.ts, which
// the e2e setup also runs).
//
// Golden rule angle: a public page never shows a price (the licence flags are
// off by default), never shows anyone's account data, and sets no cookie.

test.use({ storageState: { cookies: [], origins: [] } });

const PUBLIC_STOCK_PATHS = [
  "/s/US/AAPL",
  "/s/US/MSFT",
  "/s/US/KO",
  "/s/US/O",
  "/s/US/JNJ",
  "/s/MSX/BKMB",
  "/s/TADAWUL/2222.SR",
  "/s/ADX/FAB",
  "/s/QSE/QNBK",
];

// A figure with a currency next to it (USD 218.40, $218, SAR 25.60 ...).
const MONEY_LOOKING = /(?:\b(?:USD|SAR|OMR|AED|QAR)\s?\d|\$\s?\d)/;

test("a signed-out visitor sees the AAPL page: facts and both buttons, no price, no cookie", async ({
  page,
  context,
}) => {
  const response = await page.goto("/s/US/AAPL");
  expect(response?.status()).toBe(200);
  // Not sent to sign-in.
  await expect(page).toHaveURL(/\/s\/US\/AAPL$/);
  // No cookie is set by the page itself.
  expect(await response?.headerValue("set-cookie")).toBeNull();

  await expect(page.getByRole("heading", { level: 1, name: "AAPL" })).toBeVisible();
  await expect(page.getByText("Apple Inc.").first()).toBeVisible();
  // Market, sector (the key-facts rows).
  const facts = page.locator("dl").first();
  await expect(facts).toContainText("Market");
  await expect(facts).toContainText("US");
  await expect(facts).toContainText("Sector");
  await expect(facts).toContainText("Technology");

  // Both buttons.
  await expect(page.getByRole("main").getByRole("link", { name: "Track this in InvestIQ" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();

  // No price: the honest "sign in to see prices" instead.
  await expect(page.getByText("Sign in to see prices").first()).toBeVisible();
  const body = (await page.locator("body").innerText()) ?? "";
  expect(body).not.toMatch(MONEY_LOOKING);
  expect(body).not.toMatch(/last close/i);

  // No personal data of the e2e test login (or anyone's holdings) on the page.
  expect(body).not.toContain("e2e-test@investiq.test");
  expect(body).not.toContain("E2E Test User");
  expect(body).not.toContain("3,000");
  expect(body).not.toMatch(/Long-Term Portfolio/);

  // The page names its own official address.
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(canonical).toMatch(/\/s\/US\/AAPL$/);

  // The browser holds no cookie from visiting it.
  expect(await context.cookies()).toEqual([]);
});

test("the Tadawul page works (the dot in the ticker is fine) and shows no price", async ({
  page,
  context,
}) => {
  const response = await page.goto("/s/TADAWUL/2222.SR");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "2222.SR" })).toBeVisible();
  await expect(page.getByText("Saudi Aramco").first()).toBeVisible();
  const facts = page.locator("dl").first();
  await expect(facts).toContainText("Tadawul");
  await expect(facts).toContainText("Energy");
  await expect(page.getByText("Sign in to see prices").first()).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(MONEY_LOOKING);
  expect(await context.cookies()).toEqual([]);
});

test("a ticker that is not on the public list is a 404, and a wrong-case address is redirected", async ({
  page,
}) => {
  const missing = await page.goto("/s/US/ZZZZ");
  expect(missing?.status()).toBe(404);
  // The page does not say whether such a stock exists anywhere.
  await expect(page.locator("body")).not.toContainText("Apple");

  // A stock only the sample user tracks is not public either.
  const tracked = await page.goto("/s/OTHER/ZQLONG");
  expect(tracked?.status()).toBe(404);

  // /s/us/aapl moves permanently to the official address.
  await page.goto("/s/us/aapl");
  await expect(page).toHaveURL(/\/s\/US\/AAPL$/);
});

test("the sitemap lists the landing page, privacy, terms and only the nine public stocks", async ({
  request,
}) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const xml = await response.text();
  const addresses = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);

  expect([...addresses].sort()).toEqual(["/", "/privacy", "/terms", ...PUBLIC_STOCK_PATHS].sort());
  // Never an in-app address, and never a stock somebody typed into their own account.
  expect(addresses.some((path) => path.startsWith("/stocks"))).toBe(false);
  expect(xml).not.toContain("ZQLONG");
  expect(xml).not.toContain("ZQHUGE");
});

test("robots.txt allows the public stock pages, keeps the app out and names the sitemap", async ({
  request,
}) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(text).toMatch(/^Allow: \/s\/$/m);
  expect(text).toMatch(/^Disallow: \/dashboard$/m);
  expect(text).toMatch(/^Disallow: \/portfolio$/m);
  expect(text).toMatch(/^Sitemap: https?:\/\/[^\s]+\/sitemap\.xml$/m);
});

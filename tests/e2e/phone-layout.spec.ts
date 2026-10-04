import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  auditLayout,
  openReady,
  summarise,
  watchConsoleErrors,
  type LayoutAudit,
} from "./phone-helpers";

// The phone sweep (phone-tables-as-cards-ui.md, section 7): every screen at
// 390 x 844 as a phone (touch), the same checks for each, then a few widths
// from 360 to 1440, a dark-mode pass and a laptop guard. Every test starts
// signed in as the e2e login (tests/e2e/global-setup.ts) unless it says
// otherwise. The extra sample rows it needs come from tests/e2e/phone-seed.ts.
//
// Results are printed one line per page so the verifier can read one table;
// tap targets marked data-tap-exempt are listed, never silently ignored.
//
// Not covered here (and why): "unavailable - no exchange rate" (every
// supported currency already has a shared rate, so it cannot be seeded; the
// "no price" variant is checked instead), committee reasoning and the review
// summary (an AI run cannot be seeded without breaking reviews.spec.ts), the
// triggered alert, /portfolio/import and the check-email / verify-email pages.

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
test.use(PHONE);
test.describe.configure({ timeout: 120_000 });

const SIGNED_OUT = { cookies: [], origins: [] };

// ---------------------------------------------------------------------------
// Shared assertions
// ---------------------------------------------------------------------------

/** Soft-asserts the whole report so one run lists every problem on a page. */
function expectCleanAudit(audit: LayoutAudit, allowedScrollers: string[] = []): void {
  expect.soft(audit.pageScrollWidth, "the page scrolls sideways").toBeLessThanOrEqual(audit.viewportWidth);
  expect.soft(audit.pokingOut, "elements poke past the right edge").toEqual([]);
  expect.soft(audit.hiddenScrollers, "boxes that hide a sideways scroll").toEqual([]);
  const unexpected = audit.allowScroll.filter((name) => !allowedScrollers.includes(name));
  expect.soft(unexpected, "unapproved data-allow-scroll boxes").toEqual([]);
  expect.soft(audit.smallTargets, "tap targets under 44px").toEqual([]);
  expect.soft(audit.clippedFigures, "clipped numbers").toEqual([]);
  expect.soft(audit.bothOrNeither, "table and cards: exactly one must show").toEqual([]);
}

function report(label: string, audit: LayoutAudit): void {
  console.log(summarise(label, audit));
  for (const line of audit.exempt) console.log(`  tap-exempt on ${label}: ${line}`);
}

function cardsOf(page: Page, listName: string): Locator {
  return page.getByRole("list", { name: listName, exact: true }).locator(":scope > li");
}

/** The element is on screen, whole, and its text is not cut. */
async function expectFigureWhole(figure: Locator): Promise<void> {
  await expect(figure).toBeVisible();
  const m = await figure.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const li = node.closest("li")?.getBoundingClientRect();
    return {
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      ellipsis: getComputedStyle(node).textOverflow,
      left: r.left,
      right: r.right,
      cardLeft: li ? li.left : 0,
      cardRight: li ? li.right : 9999,
    };
  });
  expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth + 1);
  expect(m.ellipsis).not.toBe("ellipsis");
  expect(m.left).toBeGreaterThanOrEqual(m.cardLeft - 1);
  expect(m.right).toBeLessThanOrEqual(m.cardRight + 1);
  expect(m.right).toBeLessThanOrEqual(PHONE.viewport.width);
}

async function expectBox44(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) throw new Error("No box for the control");
  expect(box.width).toBeGreaterThanOrEqual(43.5);
  expect(box.height).toBeGreaterThanOrEqual(43.5);
}

// ---------------------------------------------------------------------------
// Every screen at 390 x 844
// ---------------------------------------------------------------------------

type PagePlan = {
  name: string;
  path?: string;
  /** Work the address out by browsing (ids are not known in advance). */
  resolve?: (page: Page) => Promise<string>;
  /** data-allow-scroll boxes this page may have (check 4). */
  allowScroll?: string[];
  /** The page is meant to answer 404 (failed-load console noise is fine). */
  notFound?: boolean;
};

async function firstHref(link: Locator, what: string): Promise<string> {
  const href = await link.first().getAttribute("href");
  if (!href) throw new Error(`Could not find the ${what} link`);
  return href;
}

const SIGNED_IN_PAGES: PagePlan[] = [
  { name: "/dashboard", path: "/dashboard" },
  { name: "/portfolio", path: "/portfolio" },
  { name: "/stocks", path: "/stocks" },
  { name: "/stocks?q=ap", path: "/stocks?q=ap" },
  {
    name: "/stocks/[id]",
    resolve: async (page) => {
      await openReady(page, "/stocks");
      return firstHref(
        cardsOf(page, "Stocks").locator('a[href^="/stocks/"]').filter({ hasText: /^AAPL$/ }),
        "AAPL stock",
      );
    },
    // The section strip always scrolls; the statements table scrolls when it has data.
    allowScroll: ["section-nav", "statements"],
  },
  { name: "/watchlist", path: "/watchlist" },
  { name: "/theses", path: "/theses" },
  {
    name: "/theses/[id]",
    resolve: async (page) => {
      await openReady(page, "/theses");
      return firstHref(
        cardsOf(page, "Theses").locator('a[href^="/theses/"]').filter({ hasText: "ZQLONG" }),
        "ZQLONG thesis",
      );
    },
  },
  { name: "/committee", path: "/committee" },
  { name: "/reviews", path: "/reviews" },
  { name: "/settings", path: "/settings" },
  { name: "404 page", path: "/this-page-does-not-exist-e2e", notFound: true },
];

test.describe("phone 390x844, signed in: every screen", () => {
  for (const plan of SIGNED_IN_PAGES) {
    test(`layout checks: ${plan.name}`, async ({ page }) => {
      const errors = watchConsoleErrors(page, plan.notFound);
      const path = plan.resolve ? await plan.resolve(page) : (plan.path as string);
      await openReady(page, path);

      const audit = await auditLayout(page, { tapTargets: true, figures: true });
      report(plan.name, audit);
      expectCleanAudit(audit, plan.allowScroll ?? []);
      expect.soft(errors(), "console errors").toEqual([]);
    });
  }
});

test.describe("phone 390x844, signed out: public screens", () => {
  test.use({ ...PHONE, storageState: SIGNED_OUT });

  const PUBLIC_PAGES: PagePlan[] = [
    { name: "/ (welcome)", path: "/" },
    { name: "/sign-in", path: "/sign-in" },
    { name: "/sign-up", path: "/sign-up" },
    { name: "/privacy", path: "/privacy" },
    { name: "/terms", path: "/terms" },
    { name: "/s/TADAWUL/2222.SR", path: "/s/TADAWUL/2222.SR" },
  ];

  for (const plan of PUBLIC_PAGES) {
    test(`layout checks: ${plan.name}`, async ({ page }) => {
      const errors = watchConsoleErrors(page);
      await openReady(page, plan.path as string);

      const audit = await auditLayout(page, { tapTargets: true, figures: true });
      report(plan.name, audit);
      expectCleanAudit(audit, plan.allowScroll ?? []);
      expect.soft(errors(), "console errors").toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Specific assertions (the source spec's "done when")
// ---------------------------------------------------------------------------

test.describe("phone 390x844: specific screens", () => {
  test("portfolio holdings: quantities in full, honest unavailable, nothing cut", async ({ page }) => {
    await openReady(page, "/portfolio");
    const holdings = cardsOf(page, "Holdings");
    await expect(holdings.first()).toBeVisible();

    // The 3,000-share holding (Bank Muscat in the sample portfolio).
    const bkmb = holdings.filter({ hasText: "BKMB" });
    await expect(bkmb).toHaveCount(1);
    const quantity = bkmb.locator('[data-figure][title="3,000 shares"]');
    await expect(quantity).toHaveText("3,000");
    await expectFigureWhole(quantity);
    // Market value and gain are on screen without scrolling sideways.
    const figures = bkmb.locator("[data-figure]");
    expect(await figures.count()).toBeGreaterThanOrEqual(3);
    for (const figure of await figures.all()) await expectFigureWhole(figure);

    // A holding with no stored price says so, where its value would be.
    // (The "no exchange rate" wording cannot be seeded: see the file header.)
    const noPrice = holdings.filter({ hasText: "ZQNOPX" });
    await expect(noPrice).toHaveCount(1);
    await expect(noPrice).toContainText("Unavailable — no price");
    test.info().annotations.push({
      type: "skipped-assertion",
      description: 'Unvaluable holding says "Unavailable — no exchange rate": not seedable, "no price" checked instead',
    });

    // A real holding is never shown as zero.
    const tiny = holdings.filter({ hasText: "ZQTINY" }).locator('[data-figure][title="0.00001234 shares"]');
    await expect(tiny).toHaveText("0.00001234");
    await expectFigureWhole(tiny);

    // A huge holding is shortened on the card, with the exact number reachable.
    const huge = holdings.filter({ hasText: "ZQHUGE" }).locator('[data-figure][title="12,345,678.9012 shares"]');
    await expect(huge).toHaveText("12.35M");
    await expect(huge).toHaveAttribute("aria-label", "12,345,678.9012 shares");
    await expectFigureWhole(huge);

    // Very long company name: the card stays inside the screen.
    const long = holdings.filter({ hasText: "ZQLONG" });
    await expect(long).toHaveCount(1);
    const longBox = await long.boundingBox();
    expect(longBox?.width ?? 999).toBeLessThanOrEqual(PHONE.viewport.width);
  });

  test("portfolio transactions: the broker tag opens and closes its explanation", async ({ page }) => {
    await openReady(page, "/portfolio");
    const transactions = cardsOf(page, "Transactions");
    await expect(transactions.first()).toBeVisible();

    const synced = transactions.filter({ hasText: "From broker" }).first();
    await expect(synced).toBeVisible();
    const tag = synced.getByRole("button", { name: /From broker/ });
    // The tag is a 44px-tall target (its width follows the label).
    expect((await tag.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5);

    await expect(tag).toHaveAttribute("aria-expanded", "false");
    await expect(synced.getByText(/Interactive Brokers sync/)).toHaveCount(0);
    await tag.tap();
    await expect(tag).toHaveAttribute("aria-expanded", "true");
    await expect(synced.getByText(/Interactive Brokers sync/)).toBeVisible();
    await tag.tap();
    await expect(tag).toHaveAttribute("aria-expanded", "false");
    await expect(synced.getByText(/Interactive Brokers sync/)).toHaveCount(0);
  });

  test("dashboard holdings are cards and read 3,000 shares", async ({ page }) => {
    await openReady(page, "/dashboard");
    const holdings = cardsOf(page, "Holdings");
    await expect(holdings.first()).toBeVisible();
    const bkmb = holdings.filter({ hasText: "BKMB" });
    await expect(bkmb).toContainText("3,000 shares");
    await expectFigureWhole(bkmb.locator("[data-figure]").first());
  });

  test("theses: status, score and last checked on every card; long statement clamped", async ({ page }) => {
    await openReady(page, "/theses");
    const cards = cardsOf(page, "Theses");
    await expect(cards.first()).toBeVisible();

    for (const card of await cards.all()) {
      await expect(card).toContainText(/Active|Closed/);
      await expect(card).toContainText("Integrity score");
      await expect(card).toContainText("Last checked");
      const box = await card.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(PHONE.viewport.width);
    }

    // The 500-character statement is cut to two lines.
    const long = cards.filter({ hasText: "ZQLONG" });
    await expect(long).toHaveCount(1);
    await expect(long).toContainText("72"); // its stored check
    const statement = long.locator("p.line-clamp-2");
    const lines = await statement.evaluate((p) => ({
      lineHeight: parseFloat(getComputedStyle(p).lineHeight),
      clientHeight: p.clientHeight,
      scrollHeight: p.scrollHeight,
    }));
    expect(lines.clientHeight).toBeLessThanOrEqual(lines.lineHeight * 2 + 1);
    expect(lines.scrollHeight).toBeGreaterThan(lines.clientHeight);

    // The never-checked card says so.
    await expect(cards.filter({ hasText: "MSFT" })).toContainText("Never checked");

    // Filter chips are 44px tall; the closed list works too.
    const activeChip = page.getByRole("button", { name: /^Active \(/ });
    const closedChip = page.getByRole("button", { name: /^Closed \(/ });
    for (const chip of [activeChip, closedChip]) {
      const box = await chip.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    }
    await closedChip.tap();
    await expect(cards.first()).toContainText("Closed");
    for (const card of await cards.all()) {
      await expect(card).toContainText("Closed");
      await expect(card).toContainText("Last checked");
    }
  });

  for (const view of [
    { name: "stocks", path: "/stocks", list: "Stocks" },
    { name: "watchlist", path: "/watchlist", list: "Watched and held stocks" },
  ]) {
    test(`${view.name}: every card shows its quote or the honest unavailable, star is 44x44`, async ({ page }) => {
      await openReady(page, view.path);
      const cards = cardsOf(page, view.list);
      await expect(cards.first()).toBeVisible();
      for (const card of await cards.all()) {
        const shown =
          (await card.locator("[data-figure]").count()) +
          (await card.getByText("Unavailable — no price").count());
        expect(shown, "a quote or the honest unavailable text").toBeGreaterThan(0);
        await expectBox44(card.getByRole("button", { name: /^(Watch|Stop watching) / }));
      }
    });
  }

  test("stock search results: every watch star is 44x44", async ({ page }) => {
    await openReady(page, "/stocks?q=ap");
    await expect(page.getByText("AAPL").first()).toBeVisible();
    const stars = page.getByRole("button", { name: /^(Watch|Stop watching) / });
    for (const star of await stars.all()) await expectBox44(star);
  });

  test("settings: the FX delete button is 44x44", async ({ page }) => {
    await openReady(page, "/settings");
    await expectBox44(page.getByRole("button", { name: /^Delete the USD to QAR rate/ }));
  });
});

// ---------------------------------------------------------------------------
// Width sweep: checks 1 to 4 (+ one-of table/cards) from small Android to laptop
// ---------------------------------------------------------------------------

const SWEEP_SIZES = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];
const SWEEP_PAGES = ["/portfolio", "/stocks", "/watchlist", "/theses", "/dashboard", "/settings"];

for (const size of SWEEP_SIZES) {
  test.describe(`width sweep ${size.width}x${size.height}`, () => {
    const phoneLike = size.width < 768;
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: phoneLike,
      isMobile: phoneLike,
    });

    for (const path of SWEEP_PAGES) {
      test(`${path} fits at ${size.width}`, async ({ page }) => {
        await openReady(page, path);
        const audit = await auditLayout(page, { tapTargets: false, figures: false });
        report(`${path} @${size.width}`, audit);
        // A failure here at a width where the TABLE shows means that table's
        // switch point must go up one step (768 -> 1024 -> 1280).
        expectCleanAudit(audit, []);
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Dark mode at 390 x 844
// ---------------------------------------------------------------------------

test.describe("phone 390x844, dark mode", () => {
  test.use({ ...PHONE, colorScheme: "dark" });

  for (const view of [
    { name: "portfolio", path: "/portfolio" },
    { name: "theses", path: "/theses" },
    { name: "settings", path: "/settings" },
  ]) {
    test(`${view.name} renders in dark mode with no errors`, async ({ page }) => {
      const errors = watchConsoleErrors(page);
      await openReady(page, view.path);
      await expect(page.locator("html")).toHaveClass(/dark/);
      const audit = await auditLayout(page, { tapTargets: false, figures: false });
      expect.soft(audit.pageScrollWidth, "the page scrolls sideways").toBeLessThanOrEqual(audit.viewportWidth);
      // Screenshots are for the human review only (no pixel matching).
      await page.screenshot({ path: `test-results/phone-dark-${view.name}.png`, fullPage: true });
      expect(errors(), "console errors").toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Laptop guard at 1440 x 900: tables stay tables with every column heading
// ---------------------------------------------------------------------------

test.describe("laptop 1440x900: tables unchanged", () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });

  const GUARDS: { path: string; list: string; headings: RegExp[] }[] = [
    {
      path: "/portfolio",
      list: "Holdings",
      headings: [
        /^Ticker/,
        /^Name/,
        /^Quantity/,
        /Avg Cost/,
        /Current Price/,
        /Market Value/,
        /Unrealized Gain\/Loss/,
        /Weight/,
      ],
    },
    {
      path: "/theses",
      list: "Theses",
      headings: [/^Instrument/, /^Statement/, /^Status/, /Latest Integrity Score/, /Last Checked/],
    },
    { path: "/stocks", list: "Stocks", headings: [/^Ticker/, /^Name/, /^Quote/, /Change/, /^Held/] },
    {
      path: "/watchlist",
      list: "Watched and held stocks",
      headings: [/^Ticker/, /^Name/, /^Quote/, /Active Alerts/],
    },
  ];

  for (const guard of GUARDS) {
    test(`${guard.path}: table with full headings, cards hidden`, async ({ page }) => {
      await openReady(page, guard.path);
      // The first table on each of these pages is the main list.
      const table = page.getByRole("table").first();
      await expect(table).toBeVisible();
      for (const heading of guard.headings) {
        await expect(table.getByRole("columnheader", { name: heading })).toBeVisible();
      }
      await expect(page.getByRole("list", { name: guard.list, exact: true })).toBeHidden();
    });
  }
});

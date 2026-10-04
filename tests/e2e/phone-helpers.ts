// Shared page checks for the phone-layout sweep (phone-tables-as-cards-ui.md,
// section 7). One function looks at the page that is on screen and reports
// what it finds; the specs decide what to do with the report.
//
//   1. The page itself does not scroll sideways.
//   2. Nothing pokes out past the right edge (except inside data-allow-scroll).
//   3. No table box (or any overflow-x auto/scroll box) hides a sideways scroll
//      unless it carries data-allow-scroll.
//   4. The list of data-allow-scroll boxes is a known one.
//   5. Tap targets are at least 44 x 44 (full-width links only need 44 tall).
//      Anything marked data-tap-exempt is listed, not silently ignored.
//   6. Numbers marked data-figure are not clipped or turned into "...".
//   +  Exactly one of "table" or "cards" is on screen for each card list.
//
// Check 8 (no console errors) is `watchConsoleErrors` below.

import type { Page } from "@playwright/test";

export type AuditOptions = {
  /** Check 5 (tap targets). Left off for the width sweep. */
  tapTargets: boolean;
  /** Check 6 (data-figure not clipped). Left off for the width sweep. */
  figures: boolean;
};

export type LayoutAudit = {
  viewportWidth: number;
  /** document.documentElement.scrollWidth */
  pageScrollWidth: number;
  /** Outermost visible elements whose right edge is past the viewport. */
  pokingOut: string[];
  /** Visible scroll boxes that secretly scroll sideways. */
  hiddenScrollers: string[];
  /** The data-allow-scroll values of the boxes that are on screen. */
  allowScroll: string[];
  /** Tap targets under 44px. */
  smallTargets: string[];
  /** Tap targets skipped on purpose (data-tap-exempt), with their reason. */
  exempt: string[];
  /** Numbers that are clipped or ellipsised. */
  clippedFigures: string[];
  /** Card lists where both, or neither, of table and cards are on screen. */
  bothOrNeither: string[];
};

/** Runs inside the browser. Plain JavaScript on purpose (it is serialised). */
export async function auditLayout(
  page: Page,
  options: AuditOptions,
): Promise<LayoutAudit> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("auditLayout needs a page with a viewport.");
  return page.evaluate(
    ({ vw, tapTargets, figures }) => {
      const TOL = 1;
      const MIN = 44;

      const describe = (el: Element): string => {
        const r = el.getBoundingClientRect();
        const cls = (el.getAttribute("class") ?? "").replace(/\s+/g, " ").slice(0, 70);
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
        const label = el.getAttribute("aria-label");
        return (
          `<${el.tagName.toLowerCase()}${label ? ` aria-label="${label}"` : ""}` +
          `${cls ? ` class="${cls}"` : ""}> "${text}" ` +
          `[x ${Math.round(r.left)}..${Math.round(r.right)}, ${Math.round(r.width)}x${Math.round(r.height)}]`
        );
      };

      const inDevTools = (el: Element): boolean =>
        Boolean(el.closest("nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog-overlay]"));

      const isVisible = (el: Element): boolean => {
        if (inDevTools(el)) return false;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        const anyEl = el as Element & { checkVisibility?: (o?: object) => boolean };
        return anyEl.checkVisibility ? anyEl.checkVisibility({ checkVisibilityCSS: true }) : true;
      };

      const all = Array.from(document.body.querySelectorAll("*")).filter(
        (el) => !el.closest("svg") || el.tagName.toLowerCase() === "svg",
      );

      // ---- 1 ----
      const pageScrollWidth = document.documentElement.scrollWidth;

      // ---- 2 ----
      const candidates = new Set<Element>();
      for (const el of all) {
        if (["SCRIPT", "STYLE", "OPTION", "NOSCRIPT"].includes(el.tagName)) continue;
        if (el.closest("[data-allow-scroll]")) continue;
        if (!isVisible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue; // screen-reader-only text
        if (r.right <= vw + TOL) continue;
        // Clipped by a box that itself fits (e.g. a truncated line): not poking out.
        let clipped = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox !== "visible" && p.getBoundingClientRect().right <= vw + TOL) {
            clipped = true;
            break;
          }
        }
        if (clipped) continue;
        candidates.add(el);
      }
      const pokingOut = Array.from(candidates)
        .filter((el) => !(el.parentElement && candidates.has(el.parentElement)))
        .map(describe);

      // ---- 3 ----
      const hiddenScrollers: string[] = [];
      for (const el of all) {
        if (["INPUT", "TEXTAREA", "SELECT", "OPTION", "svg"].includes(el.tagName)) continue;
        if (el.closest("[data-allow-scroll]")) continue;
        const isTable = el.getAttribute("data-slot") === "table-container";
        const ox = getComputedStyle(el).overflowX;
        if (!isTable && ox !== "auto" && ox !== "scroll") continue;
        if (!isVisible(el)) continue;
        if (el.scrollWidth > el.clientWidth + TOL) {
          hiddenScrollers.push(`${describe(el)} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
        }
      }

      // ---- 4 ----
      const allowScroll = Array.from(document.querySelectorAll("[data-allow-scroll]"))
        .filter(isVisible)
        .map((el) => el.getAttribute("data-allow-scroll") ?? "");

      // ---- 5 ----
      const smallTargets: string[] = [];
      const exempt: string[] = [];
      if (tapTargets) {
        const targets = document.body.querySelectorAll(
          "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=menuitem], [role=tab]",
        );
        for (const el of Array.from(targets)) {
          if (!isVisible(el)) continue;
          if (el.closest('[aria-hidden="true"]')) continue;
          const own = el.getBoundingClientRect();
          if (own.width <= 1 || own.height <= 1) continue; // screen-reader-only
          const exemptEl = el.closest("[data-tap-exempt]");
          if (exemptEl) {
            exempt.push(`${exemptEl.getAttribute("data-tap-exempt") || "(no reason)"}: ${describe(el)}`);
            continue;
          }
          // A link whose ::after covers its card (the stretched link) is
          // tapped over the whole card: measure that box instead.
          let rect = own;
          const after = getComputedStyle(el, "::after");
          if (after.content !== "none" && after.position === "absolute") {
            for (let p = el.parentElement; p; p = p.parentElement) {
              if (getComputedStyle(p).position !== "static") {
                rect = p.getBoundingClientRect();
                break;
              }
            }
          }
          const tallEnough = rect.height >= MIN - 0.5;
          const wideEnough = rect.width >= MIN - 0.5;
          const fullWidthLink = el.tagName === "A" && rect.width >= vw * 0.6;
          if (!(tallEnough && (wideEnough || fullWidthLink))) smallTargets.push(describe(el));
        }
      }

      // ---- 6 ----
      const clippedFigures: string[] = [];
      if (figures) {
        for (const el of Array.from(document.querySelectorAll("[data-figure]"))) {
          if (!isVisible(el)) continue;
          if (el.closest("[data-allow-scroll]")) continue;
          const r = el.getBoundingClientRect();
          let problem = "";
          for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
            const cs = getComputedStyle(a);
            if (cs.textOverflow === "ellipsis" && a.scrollWidth > a.clientWidth + TOL) {
              problem = "ellipsis";
              break;
            }
            if (cs.overflowX !== "visible") {
              const ar = a.getBoundingClientRect();
              if (r.right > ar.right + TOL || r.left < ar.left - TOL) {
                problem = "cut by a parent box";
                break;
              }
            }
          }
          if (!problem && el.scrollWidth > el.clientWidth + TOL && getComputedStyle(el).display !== "inline") {
            problem = "scrollWidth > clientWidth";
          }
          if (!problem && r.right > vw + TOL) problem = "past the right edge";
          if (problem) clippedFigures.push(`${problem}: ${describe(el)}`);
        }
      }

      // ---- table-or-cards ----
      const bothOrNeither: string[] = [];
      for (const container of Array.from(document.querySelectorAll('[data-slot="table-container"]'))) {
        const tableSide = container.parentElement;
        const list = tableSide?.nextElementSibling;
        if (!tableSide || !list || list.tagName !== "UL" || !list.getAttribute("aria-label")) continue;
        if (list.querySelectorAll(":scope > li").length === 0) continue;
        const tableShown = isVisible(tableSide);
        const cardsShown = isVisible(list);
        if (tableShown === cardsShown) {
          bothOrNeither.push(
            `"${list.getAttribute("aria-label")}": table ${tableShown ? "shown" : "hidden"}, cards ${cardsShown ? "shown" : "hidden"}`,
          );
        }
      }

      return {
        viewportWidth: vw,
        pageScrollWidth,
        pokingOut,
        hiddenScrollers,
        allowScroll,
        smallTargets,
        exempt,
        clippedFigures,
        bothOrNeither,
      };
    },
    { vw: viewport.width, tapTargets: options.tapTargets, figures: options.figures },
  );
}

/** Wait for fonts, loading skeletons and the network to settle. */
export async function waitForPageReady(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  // Streamed pages show grey skeletons first; wait for the real content.
  await page
    .waitForFunction(() => document.querySelectorAll('[data-slot="skeleton"]').length === 0, undefined, {
      timeout: 20_000,
    })
    .catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
}

/** Go to a page and wait until it is ready to be measured. */
export async function openReady(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "load" });
  await waitForPageReady(page);
  return response;
}

/**
 * Collects console errors and uncaught page errors (check 8). Pass
 * `ignoreFailedLoads` on pages that are MEANT to answer 404.
 */
export function watchConsoleErrors(page: Page, ignoreFailedLoads = false): () => string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (ignoreFailedLoads && /Failed to load resource/i.test(text)) return;
    errors.push(text);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return () => errors;
}

/** One printable line for the verifier's results table. */
export function summarise(label: string, audit: LayoutAudit): string {
  return (
    `${label.padEnd(34)} w=${audit.viewportWidth} scrollWidth=${audit.pageScrollWidth} ` +
    `poking=${audit.pokingOut.length} scrollers=${audit.hiddenScrollers.length} ` +
    `allow=[${audit.allowScroll.join(",")}] small=${audit.smallTargets.length} ` +
    `exempt=${audit.exempt.length} clipped=${audit.clippedFigures.length} ` +
    `both/neither=${audit.bothOrNeither.length}`
  );
}

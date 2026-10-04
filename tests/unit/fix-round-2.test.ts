// Fix round 2: refused single file never "Ready", 44px link width, Free-user
// thesis wording, one wrong-currency message, and real 404s for missing pages.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { singleFileZoneLine } from "@/components/import/file-step";
import { emptyHistoryText } from "@/components/theses/check-history-timeline";
import { visibleFormError } from "@/lib/instrument-currency";
import {
  CARD_LINK_TAP_AREA,
  TABLE_ROW_LINK,
} from "@/components/ui/row-link";

const root = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("single-file upload box", () => {
  it("a refused file is never called Ready", () => {
    const line = singleFileZoneLine([{ problem: "Doesn't match" }]);
    expect(line).not.toMatch(/ready/i);
    expect(line).toMatch(/can't be used/i);
  });
  it("a fine file is Ready", () => {
    expect(singleFileZoneLine([{}])).toMatch(/^Ready/);
  });
  it("the upload box checks the problem flag before showing the green tick", () => {
    const src = read("src/components/import/file-step.tsx");
    expect(src.indexOf("singleRefused ? (")).toBeLessThan(src.indexOf("hasFile && !multi ? ("));
  });
});

describe("44px link width", () => {
  it("ticker links are at least 44px wide as well as tall", () => {
    expect(TABLE_ROW_LINK).toContain("min-w-11");
    expect(CARD_LINK_TAP_AREA).toContain("min-w-11");
    expect(read("src/components/stocks/stock-search.tsx")).toContain("min-w-11");
  });
});

describe("thesis check history wording", () => {
  it("Free users are not pointed at a button they do not have", () => {
    expect(emptyHistoryText(true)).toBe("Thesis check-ups are part of Pro, coming soon.");
    expect(emptyHistoryText(true)).not.toMatch(/Check thesis now/);
    expect(emptyHistoryText(false)).toMatch(/Check thesis now/);
  });
});

describe("wrong-currency message shows once", () => {
  const sentence = "AAPL trades in USD, but this trade says OMR. Change the currency to USD.";
  it("hides the red copy when it repeats the amber hint", () => {
    expect(visibleFormError(sentence, sentence)).toBeNull();
  });
  it("still shows other errors, and errors when there is no hint", () => {
    expect(visibleFormError("Something else", sentence)).toBe("Something else");
    expect(visibleFormError(sentence, null)).toBe(sentence);
    expect(visibleFormError(null, sentence)).toBeNull();
  });
});

describe("missing pages use the shared not-found page", () => {
  const detailPages = [
    "src/app/(app)/stocks/[id]/page.tsx",
    "src/app/(app)/theses/[id]/page.tsx",
    "src/app/(app)/reviews/[id]/page.tsx",
    "src/app/(app)/committee/history/[id]/page.tsx",
  ];
  // Decision: these signed-in pages keep their loading screens (the standards
  // ask for skeleton loaders). A loading screen makes the page stream, so a
  // missing item renders the not-found page with a 200 status — harmless,
  // because these pages sit behind sign-in and are never indexed.
  it.each(detailPages)("%s uses notFound() and keeps its loading screen", (page) => {
    const src = read(page);
    expect(src).toMatch(/import \{[^}]*notFound[^}]*\} from "next\/navigation"/);
    expect(src).not.toMatch(/function notFound/);
    const dir = path.dirname(page);
    expect(existsSync(path.join(root, dir, "loading.tsx"))).toBe(true);
  });
  it.each(["stocks", "theses", "reviews", "committee"])(
    "%s: the list page's loading screen is not shared with the detail pages",
    (section) => {
      expect(existsSync(path.join(root, `src/app/(app)/${section}/loading.tsx`))).toBe(false);
      expect(existsSync(path.join(root, `src/app/(app)/${section}/(main)/loading.tsx`))).toBe(true);
    },
  );
});

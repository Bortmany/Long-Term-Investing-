// The display rule is the only thing that may produce a verdict. These tests
// pin its full table, including the 100 / 101 day boundary.

import { describe, expect, it, vi } from "vitest";
import { resolveShariaDisplay } from "@/lib/sharia/display";
import { methodSentence, notScreenedReasonText, BADGE_LABELS } from "@/lib/sharia/wording";
import type { StoredShariaScreen } from "@/lib/sharia/types";

const now = new Date("2026-10-04T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function row(overrides: Partial<StoredShariaScreen> = {}): StoredShariaScreen {
  return {
    verdict: "COMPLIANT",
    source: "musaffa",
    methodName: "Fake method",
    methodVersion: "v2",
    asOf: new Date(now.getTime() - 5 * DAY),
    fetchedAt: new Date(now.getTime() - DAY),
    ...overrides,
  };
}

function resolve(input: Partial<Parameters<typeof resolveShariaDisplay>[0]> = {}) {
  return resolveShariaDisplay({
    row: row(),
    activeVendor: "musaffa",
    market: "US",
    configured: true,
    now,
    ...input,
  });
}

describe("resolveShariaDisplay", () => {
  it("shows Compliant and Not compliant exactly as stored", () => {
    expect(resolve().state).toBe("compliant");
    expect(resolve({ row: row({ verdict: "NOT_COMPLIANT" }) }).state).toBe("not_compliant");
  });

  it("1. no key: Not screened 'not_set_up' even when old rows exist", () => {
    expect(resolve({ configured: false })).toEqual({ state: "not_screened", reason: "not_set_up" });
    expect(resolve({ activeVendor: null })).toEqual({ state: "not_screened", reason: "not_set_up" });
  });

  it("2. uncovered exchange: Not screened 'not_covered' even when a row exists", () => {
    for (const market of ["MSX", "QSE", "OTHER"]) {
      expect(resolve({ market })).toEqual({ state: "not_screened", reason: "not_covered" });
    }
    for (const market of ["US", "TADAWUL", "DFM", "ADX"]) {
      expect(resolve({ market }).state).toBe("compliant");
    }
  });

  it("3. no row, or a row from a different supplier: 'no_verdict'", () => {
    expect(resolve({ row: null })).toEqual({ state: "not_screened", reason: "no_verdict" });
    expect(resolve({ row: row({ source: "zoya" }) })).toEqual({
      state: "not_screened",
      reason: "no_verdict",
    });
  });

  it("a row with no method name is never shown", () => {
    expect(resolve({ row: row({ methodName: "  " }) }).state).toBe("not_screened");
  });

  it("4. exactly 100 days old still shows; 101 days does not", () => {
    expect(resolve({ row: row({ asOf: new Date(now.getTime() - 100 * DAY) }) }).state).toBe("compliant");
    const old = resolve({ row: row({ asOf: new Date(now.getTime() - 101 * DAY) }) });
    expect(old.state).toBe("not_screened");
    expect(old).toMatchObject({ reason: "too_old" });
  });

  it("age counts whole UTC days, not hours", () => {
    // 100 days and 23 hours earlier in the same UTC calendar day count as 100.
    const lateNow = new Date("2026-10-04T23:59:00Z");
    const asOf = new Date("2026-06-26T00:00:00Z"); // 100 UTC days before Oct 4
    expect(resolve({ now: lateNow, row: row({ asOf }) }).state).toBe("compliant");
    const earlier = new Date("2026-06-25T23:59:00Z"); // 101 UTC days
    expect(resolve({ now: lateNow, row: row({ asOf: earlier }) }).state).toBe("not_screened");
  });

  it("a data date in the future is bad data: Not screened and a warning", () => {
    const onWarn = vi.fn();
    const result = resolve({ row: row({ asOf: new Date(now.getTime() + 3 * DAY) }), onWarn });
    expect(result).toEqual({ state: "not_screened", reason: "no_verdict" });
    expect(onWarn).toHaveBeenCalledOnce();
  });
});

describe("Sharia wording", () => {
  it("the detail sentence is the decision's wording, character for character", () => {
    expect(
      methodSentence({
        methodName: "AAOIFI-based method",
        methodVersion: "v2",
        vendorName: "Musaffa",
        checkedLabel: "Sep 29, 2026",
      }),
    ).toBe(
      "Screen per AAOIFI-based method v2, supplied by Musaffa, checked Sep 29, 2026. " +
        "This is an automated screen, not a religious ruling (fatwa). " +
        "Different scholars and methods can reach different results. Ask a qualified scholar if unsure.",
    );
  });

  it("prints no version when the supplier gave none", () => {
    expect(
      methodSentence({ methodName: "M", methodVersion: "", vendorName: "Musaffa", checkedLabel: "X" }),
    ).toMatch(/^Screen per M, supplied by Musaffa, checked X\./);
  });

  it("the Not screened reasons are the fixed sentences", () => {
    expect(notScreenedReasonText("not_set_up", { exchangeName: "" })).toBe(
      "Sharia screening isn't switched on for this server yet.",
    );
    expect(notScreenedReasonText("not_covered", { exchangeName: "Muscat" })).toBe(
      "Our screening source doesn't cover Muscat stocks yet.",
    );
    expect(notScreenedReasonText("no_verdict", { exchangeName: "" })).toBe(
      "Our screening source has no verdict for this stock.",
    );
    expect(notScreenedReasonText("too_old", { exchangeName: "", checkedLabel: "Jun 1, 2026" })).toBe(
      "The last verdict we have is from Jun 1, 2026, more than 100 days ago, so we're not showing it.",
    );
  });

  it("never uses religious shorthand", () => {
    const all = JSON.stringify([BADGE_LABELS]) + methodSentence({
      methodName: "M",
      methodVersion: "",
      vendorName: "V",
      checkedLabel: "D",
    });
    expect(all.toLowerCase()).not.toMatch(/halal|haram|permissible|forbidden/);
  });
});

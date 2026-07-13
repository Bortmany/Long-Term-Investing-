import { describe, expect, it } from "vitest";

import { isoWeekPeriod } from "@/lib/reviews/period";

describe("isoWeekPeriod", () => {
  it("assigns an early-January date to the PREVIOUS ISO year's week 52/53", () => {
    // Jan 1, 2027 is a Friday. ISO-8601 week 1 must contain the year's first
    // Thursday; 2027's first Thursday is Jan 7, so Jan 1 falls in the last
    // week of ISO year 2026 (week 53), not week 1 of 2027.
    const date = new Date("2027-01-01T00:00:00Z");
    expect(isoWeekPeriod(date)).toBe("2026-W53");
  });

  it("assigns a late-December date to the NEXT ISO year's week 1", () => {
    // Dec 31, 2029 is a Monday, which starts a new ISO week that contains
    // Jan 1-3, 2030 (a Tue/Wed/Thu) — so it belongs to ISO week 1 of 2030.
    const date = new Date("2029-12-31T00:00:00Z");
    expect(isoWeekPeriod(date)).toBe("2030-W01");
  });

  it("returns the ordinary mid-year week as a sanity check", () => {
    // Jul 13, 2026 is a Monday — the 29th ISO week of 2026.
    const date = new Date("2026-07-13T00:00:00Z");
    expect(isoWeekPeriod(date)).toBe("2026-W29");
  });
});

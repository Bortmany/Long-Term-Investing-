import { describe, expect, it } from "vitest";

import { currentIsoPeriod, previousPeriod } from "@/lib/reviews/period";

describe("currentIsoPeriod — classic ISO-8601 edge cases", () => {
  it("a plain midweek date", () => {
    // Wednesday, 2026-07-15 — falls in the middle of an ordinary week.
    expect(currentIsoPeriod(new Date("2026-07-15T12:00:00Z"))).toBe("2026-W29");
  });

  it("Jan 1 falling in the PREVIOUS year's week 52 (Jan 1 2023 was a Sunday)", () => {
    expect(currentIsoPeriod(new Date("2023-01-01T00:00:00Z"))).toBe("2022-W52");
  });

  it("Jan 1 falling in week 01 of its own year (Jan 1 2024 was a Monday)", () => {
    expect(currentIsoPeriod(new Date("2024-01-01T00:00:00Z"))).toBe("2024-W01");
  });

  it("Dec 31 spilling FORWARD into next year's week 01 (Dec 31 2018 was a Monday)", () => {
    expect(currentIsoPeriod(new Date("2018-12-31T00:00:00Z"))).toBe("2019-W01");
  });

  it("Jan 1 falling in the PREVIOUS (leap) year's week 53 (Jan 1 2021 was a Friday, 2020 had 53 ISO weeks)", () => {
    expect(currentIsoPeriod(new Date("2021-01-01T00:00:00Z"))).toBe("2020-W53");
  });

  it("Dec 31 of a 53-week leap year still belongs to that same year's week 53", () => {
    expect(currentIsoPeriod(new Date("2020-12-31T00:00:00Z"))).toBe("2020-W53");
  });

  it("a non-leap year with an ordinary 52 weeks", () => {
    // Dec 28 2023 (Thursday) is always in the last ISO week of 2023.
    expect(currentIsoPeriod(new Date("2023-12-28T00:00:00Z"))).toBe("2023-W52");
  });
});

describe("previousPeriod", () => {
  it("steps back one week within the same year", () => {
    expect(previousPeriod("2026-W29")).toBe("2026-W28");
  });

  it("crosses a year boundary into a plain 52-week year", () => {
    expect(previousPeriod("2024-W01")).toBe("2023-W52");
  });

  it("crosses a year boundary into a 53-week (leap-adjacent) year", () => {
    expect(previousPeriod("2021-W01")).toBe("2020-W53");
  });

  it("throws on a malformed period rather than guessing", () => {
    expect(() => previousPeriod("2026-7")).toThrow();
    expect(() => previousPeriod("not-a-period")).toThrow();
  });

  it("throws on an out-of-range week number", () => {
    expect(() => previousPeriod("2026-W00")).toThrow();
    expect(() => previousPeriod("2026-W54")).toThrow();
  });

  it("round-trips with currentIsoPeriod across a year boundary", () => {
    const period = currentIsoPeriod(new Date("2024-01-01T00:00:00Z")); // "2024-W01"
    expect(previousPeriod(period)).toBe("2023-W52");
  });
});

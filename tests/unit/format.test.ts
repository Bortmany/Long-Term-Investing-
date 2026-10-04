import { describe, expect, it } from "vitest";
import { formatIsoWeek, formatPercent, formatQuantity, formatQuantityCompact } from "@/lib/format";

// The spec's 15-row table (phone-tables-as-cards-ui.md section 5.3).
const quantityRows: [string, number, string, string][] = [
  ["3,000 shares (IQ-02)", 3000, "3,000", "3,000"],
  ["whole number stays whole", 3, "3", "3"],
  ["true zero", 0, "0", "0"],
  ["no trailing zeros", 1.5, "1.5", "1.5"],
  ["4 decimals, rounded", 0.12346, "0.1235", "0.1235"],
  ["14 characters, still full", 1234567.8912, "1,234,567.8912", "1,234,567.8912"],
  ["14 characters, still full (2)", 12345678.912, "12,345,678.912", "12,345,678.912"],
  ["15 characters, short on cards", 12345678.9012, "12,345,678.9012", "12.35M"],
  ["billions", 123456789012, "123,456,789,012", "123.46B"],
  ["trillions", 2500000000000, "2,500,000,000,000", "2.5T"],
  ["a real holding is never 0", 0.00001234, "0.00001234", "0.00001234"],
  ["smaller than the smallest shown", 0.000000001, "<0.00000001", "<0.00000001"],
  ["minus kept", -5, "-5", "-5"],
  ["negative zero", -0, "0", "0"],
  ["NaN", NaN, "—", "—"],
  ["Infinity", Infinity, "—", "—"],
];

describe("formatQuantity and formatQuantityCompact (spec table)", () => {
  it.each(quantityRows)("%s", (_label, input, full, compact) => {
    expect(formatQuantity(input)).toBe(full);
    expect(formatQuantityCompact(input)).toBe(compact);
  });

  it("never shows NaN or Infinity text", () => {
    for (const v of [NaN, Infinity, -Infinity]) {
      expect(formatQuantity(v)).toBe("—");
      expect(formatQuantityCompact(v)).toBe("—");
    }
  });

  it("short numbers are identical in both forms", () => {
    for (const v of [1, 10, 999, 1000, 54321.5]) {
      expect(formatQuantityCompact(v)).toBe(formatQuantity(v));
    }
  });
});

describe("formatPercent", () => {
  it("formats to one decimal place", () => {
    expect(formatPercent(9.44)).toBe("9.4%");
    expect(formatPercent(9)).toBe("9.0%");
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("keeps the minus sign on negatives", () => {
    expect(formatPercent(-3.25)).toBe("-3.3%");
    expect(formatPercent(-3.25, { signed: true })).toBe("-3.3%");
  });

  it("prefixes + on positives only when signed is requested", () => {
    expect(formatPercent(9.4, { signed: true })).toBe("+9.4%");
    expect(formatPercent(9.4)).toBe("9.4%");
    expect(formatPercent(0, { signed: true })).toBe("0.0%");
  });

  it("never shows a negative zero", () => {
    expect(formatPercent(-0.01)).toBe("0.0%");
  });
});

describe("formatIsoWeek", () => {
  it("labels a same-month ISO week (spec example)", () => {
    // ISO week 28 of 2026 runs Monday Jul 6 through Sunday Jul 12.
    expect(formatIsoWeek("2026-W28")).toBe("Week of Jul 6–12, 2026");
  });

  it("labels a week that crosses a month boundary", () => {
    // ISO week 27 of 2026 runs Monday Jun 29 through Sunday Jul 5.
    expect(formatIsoWeek("2026-W27")).toBe("Week of Jun 29 – Jul 5, 2026");
  });

  it("labels a week that crosses New Year", () => {
    // ISO week 1 of 2026 runs Monday Dec 29, 2025 through Sunday Jan 4, 2026.
    expect(formatIsoWeek("2026-W01")).toBe("Week of Dec 29, 2025 – Jan 4, 2026");
  });

  it("handles a 53-week ISO year", () => {
    // 2020 had 53 ISO weeks; week 53 ran Monday Dec 28, 2020 – Sunday Jan 3, 2021.
    expect(formatIsoWeek("2020-W53")).toBe("Week of Dec 28, 2020 – Jan 3, 2021");
  });

  it("starts weeks on Monday even when Jan 1 falls late in the week", () => {
    // 2021-01-01 was a Friday, so ISO week 1 of 2021 started Monday Jan 4.
    expect(formatIsoWeek("2021-W01")).toBe("Week of Jan 4–10, 2021");
  });

  it("throws on malformed input instead of guessing a date range", () => {
    expect(() => formatIsoWeek("2026-28")).toThrow();
    expect(() => formatIsoWeek("garbage")).toThrow();
    expect(() => formatIsoWeek("2026-W00")).toThrow();
    expect(() => formatIsoWeek("2026-W54")).toThrow();
  });
});

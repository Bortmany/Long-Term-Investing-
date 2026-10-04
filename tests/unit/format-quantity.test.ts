import { describe, expect, it } from "vitest";

import { formatQuantity, formatQuantityCompact } from "@/lib/format";

describe("formatQuantity", () => {
  it("keeps 3,000 whole (the clipped '3,0' scenario)", () => {
    expect(formatQuantity(3000)).toBe("3,000");
    expect(formatQuantity(3)).toBe("3");
    expect(formatQuantity(1.5)).toBe("1.5");
    expect(formatQuantity(1.23456)).toBe("1.2346");
  });
  it("a true zero is 0; negative zero is 0", () => {
    expect(formatQuantity(0)).toBe("0");
    expect(formatQuantity(-0)).toBe("0");
  });
  it("a real holding never shows as zero", () => {
    expect(formatQuantity(0.00001234)).toBe("0.00001234");
    expect(formatQuantity(0.000000001)).toBe("<0.00000001");
  });
  it("a value that is not a number shows a dash", () => {
    expect(formatQuantity(NaN)).toBe("—");
    expect(formatQuantity(Infinity)).toBe("—");
  });
  it("negatives keep their sign", () => {
    expect(formatQuantity(-2500)).toBe("-2,500");
  });
});

describe("formatQuantityCompact", () => {
  it("shows the full number when it is 14 characters or fewer", () => {
    expect(formatQuantityCompact(3000)).toBe("3,000");
    expect(formatQuantityCompact(123456789)).toBe("123,456,789");
  });
  it("shortens only huge numbers", () => {
    expect(formatQuantityCompact(123456789012)).toBe("123.46B");
    expect(formatQuantityCompact(1234567890123456)).toBe("1,234.57T");
  });
  it("never turns a small real holding into zero", () => {
    expect(formatQuantityCompact(0.00001234)).toBe("0.00001234");
  });
  it("dash for a non-number", () => {
    expect(formatQuantityCompact(NaN)).toBe("—");
  });
});

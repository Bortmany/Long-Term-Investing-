// The words on the amber "Some positions couldn't be valued" banner.
import { describe, expect, it } from "vitest";
import { collectUnvaluedItems, describeUnvalued, joinNames } from "@/lib/portfolio/unvalued";

const labelFor = (id: string) => id.toUpperCase();

describe("collectUnvaluedItems / describeUnvalued", () => {
  it("returns nothing (banner hidden) when nothing is missing", () => {
    const items = collectUnvaluedItems({ portfolioMissing: [], labelFor });
    expect(items).toEqual([]);
    expect(describeUnvalued(items)).toBeNull();
  });

  it("names holdings with their reasons", () => {
    const summary = describeUnvalued(
      collectUnvaluedItems({
        portfolioMissing: [
          { instrumentId: "armco", currency: "SAR", reason: "missing_fx_rate" },
          { instrumentId: "bkmb", reason: "missing_price" },
        ],
        labelFor,
      }),
    );
    expect(summary?.title).toBe("Some positions couldn't be valued");
    expect(summary?.description).toBe(
      "The totals below include only what could be valued. Couldn't be valued: ARMCO (no exchange rate), BKMB (no price).",
    );
    expect(summary?.needsRate).toBe(true);
    expect(summary?.needsPrice).toBe(true);
  });

  it("names only the first three, then 'and N more'", () => {
    const summary = describeUnvalued(
      collectUnvaluedItems({
        portfolioMissing: ["a", "b", "c", "d", "e"].map((id) => ({
          instrumentId: id,
          reason: "missing_fx_rate" as const,
        })),
        labelFor,
      }),
    );
    expect(summary?.description).toContain("A (no exchange rate), B (no exchange rate), C (no exchange rate) and 2 more.");
    expect(summary?.needsPrice).toBe(false);
  });

  it("covers cash balances and dividends, without listing the same thing twice", () => {
    const items = collectUnvaluedItems({
      portfolioMissing: [
        { instrumentId: "armco", currency: "SAR", reason: "missing_fx_rate" },
        { currency: "SAR", reason: "missing_fx_rate" },
      ],
      dividendMissing: [
        { instrumentId: "armco", currency: "SAR", amount: 1, tradeDate: new Date("2026-06-01") },
      ],
      returnsMissing: [
        { kind: "dividend", currency: "SAR" },
        { kind: "contribution", currency: "SAR" },
      ],
      labelFor,
    });
    expect(items.map((i) => i.label)).toEqual([
      "ARMCO",
      "SAR cash",
      "SAR deposits and withdrawals",
    ]);
  });
});

describe("joinNames", () => {
  it("handles one, two, three and many", () => {
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B"])).toBe("A and B");
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
    expect(joinNames(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more");
  });
});

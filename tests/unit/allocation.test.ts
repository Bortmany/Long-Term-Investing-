import { describe, expect, it } from "vitest";
import { computeAllocation, type AllocatableHolding } from "@/lib/portfolio/allocation";

const holding = (
  overrides: Partial<AllocatableHolding> & Pick<AllocatableHolding, "instrumentId" | "marketValue">,
): AllocatableHolding => ({
  sector: null,
  country: null,
  market: "US",
  ...overrides,
});

describe("computeAllocation", () => {
  const holdings: AllocatableHolding[] = [
    holding({ instrumentId: "aapl", marketValue: 400, sector: "Technology", country: "United States" }),
    holding({ instrumentId: "msft", marketValue: 300, sector: "Technology", country: "United States" }),
    holding({ instrumentId: "bkmb", marketValue: 200, sector: "Banks", country: "Oman", market: "MSX" }),
    holding({ instrumentId: "mystery", marketValue: 100 }), // null sector + country
  ];

  it("groups by sector with shares of the total, largest first", () => {
    const allocation = computeAllocation(holdings, "sector");
    expect(allocation.total).toBe(1000);
    expect(allocation.slices.map((s) => s.label)).toEqual([
      "Technology",
      "Banks",
      "Unknown",
    ]);
    expect(allocation.slices[0].value).toBe(700);
    expect(allocation.slices[0].sharePercent).toBeCloseTo(70);
    expect(allocation.slices[2].sharePercent).toBeCloseTo(10);
  });

  it("puts null sector/country into an Unknown bucket that always sorts last", () => {
    // Make Unknown the BIGGEST bucket — it must still be last.
    const skewed = [
      holding({ instrumentId: "a", marketValue: 900 }), // null sector
      holding({ instrumentId: "b", marketValue: 100, sector: "Energy" }),
    ];
    const allocation = computeAllocation(skewed, "sector");
    expect(allocation.slices.map((s) => s.label)).toEqual(["Energy", "Unknown"]);
    expect(allocation.slices[1].value).toBe(900);
  });

  it("never has an Unknown bucket for market (a required enum)", () => {
    const allocation = computeAllocation(holdings, "market");
    expect(allocation.slices.map((s) => s.label)).toEqual(["US", "MSX"]);
    expect(allocation.slices.find((s) => s.label === "Unknown")).toBeUndefined();
  });

  it("groups by country", () => {
    const allocation = computeAllocation(holdings, "country");
    expect(allocation.slices.map((s) => s.label)).toEqual([
      "United States",
      "Oman",
      "Unknown",
    ]);
  });

  it("returns an empty slice list for an empty portfolio", () => {
    const allocation = computeAllocation([], "sector");
    expect(allocation.total).toBe(0);
    expect(allocation.slices).toEqual([]);
  });

  it("guards share against a zero total (no NaN)", () => {
    const allocation = computeAllocation(
      [holding({ instrumentId: "zero", marketValue: 0, sector: "Energy" })],
      "sector",
    );
    expect(allocation.slices[0].sharePercent).toBe(0);
    expect(Number.isNaN(allocation.slices[0].sharePercent)).toBe(false);
  });
});

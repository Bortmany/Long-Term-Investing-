// The golden-rule badge mapping: every displayed figure carries an honest
// source badge. Phase 2 makes "derived" its own badge ("Computed from your
// transactions") instead of borrowing "sample" — these tests pin that down.
import { describe, expect, it } from "vitest";
import { badgePropsForValueSource, badgePropsForValueSources } from "@/components/source-badge";
import { formatShortDate } from "@/lib/format";
import { decideDividendCard } from "@/lib/portfolio/dividend-card";
import type { ValueSource } from "@/lib/portfolio";

const d = (s: string) => new Date(s);

describe("badgePropsForValueSource", () => {
  it("maps derived to the derived badge, not sample (Phase 2 change)", () => {
    expect(badgePropsForValueSource({ kind: "derived" })).toEqual({ variant: "derived" });
  });

  it("maps live to live", () => {
    expect(badgePropsForValueSource({ kind: "live", asOf: d("2026-07-10") })).toEqual({
      variant: "live",
    });
  });

  it("maps manual to manual with its formatted as-of date", () => {
    const asOf = d("2026-07-01");
    expect(badgePropsForValueSource({ kind: "manual", asOf })).toEqual({
      variant: "manual",
      date: formatShortDate(asOf),
    });
  });

  it("maps sample to sample", () => {
    expect(badgePropsForValueSource({ kind: "sample", asOf: d("2026-07-10") })).toEqual({
      variant: "sample",
    });
  });
});

describe("badgePropsForValueSources (aggregate precedence)", () => {
  it("any sample input makes the aggregate sample", () => {
    const sources: ValueSource[] = [
      { kind: "live", asOf: d("2026-07-10") },
      { kind: "manual", asOf: d("2026-07-01") },
      { kind: "sample", asOf: d("2026-07-05") },
      { kind: "derived" },
    ];
    expect(badgePropsForValueSources(sources)).toEqual({ variant: "sample" });
  });

  it("without sample, any manual input makes the aggregate manual with the OLDEST as-of date", () => {
    const oldest = d("2026-06-20");
    const sources: ValueSource[] = [
      { kind: "live", asOf: d("2026-07-10") },
      { kind: "manual", asOf: d("2026-07-01") },
      { kind: "manual", asOf: oldest },
      { kind: "derived" },
    ];
    expect(badgePropsForValueSources(sources)).toEqual({
      variant: "manual",
      date: formatShortDate(oldest),
    });
  });

  it("without sample or manual, any live input makes the aggregate live", () => {
    const sources: ValueSource[] = [{ kind: "live", asOf: d("2026-07-10") }, { kind: "derived" }];
    expect(badgePropsForValueSources(sources)).toEqual({ variant: "live" });
  });

  it("derived-only aggregates are derived, not sample (Phase 2 change)", () => {
    const sources: ValueSource[] = [{ kind: "derived" }, { kind: "derived" }];
    expect(badgePropsForValueSources(sources)).toEqual({ variant: "derived" });
  });
});

describe("dividend figures and the derived badge", () => {
  const miss = [
    { currency: "SAR" as const, amount: 100, tradeDate: d("2026-06-01"), instrumentId: "armco" },
  ];
  const decide = (missing: typeof miss) =>
    decideDividendCard({
      baseCurrency: "OMR",
      income: { missing },
      monthly: { missing },
      byHolding: { missing },
      labelFor: () => "ARMCO",
    });

  it("a complete dividend figure gets the derived badge", () => {
    const state = decide([]);
    expect(state.kind).toBe("badge");
    if (state.kind === "badge") {
      expect(badgePropsForValueSource({ kind: "derived" })).toEqual(state.badge);
    }
  });

  it("an incomplete dividend figure does NOT get the derived badge", () => {
    const state = decide(miss);
    expect(state.kind).toBe("warning");
    expect(state).not.toHaveProperty("badge");
  });
});

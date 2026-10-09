// The Dividend Income card: clean badge only when nothing was left out,
// otherwise an amber warning that names the holdings (golden rule).
import { describe, expect, it } from "vitest";
import { decideDividendCard, dividendWarningTitle } from "@/lib/portfolio/dividend-card";
import type { MissingDividend } from "@/lib/portfolio/dividends";

const missing = (instrumentId: string | undefined, currency: "SAR" | "AED" = "SAR"): MissingDividend => ({
  currency,
  amount: 100,
  tradeDate: new Date("2026-06-01"),
  ...(instrumentId ? { instrumentId } : {}),
});

const names: Record<string, string> = {
  a: "ARMCO",
  b: "BKMB",
  c: "EMAAR",
  d: "FAB",
  e: "QNBK",
};
const labelFor = (id: string) => names[id] ?? id;

function decide(
  income: MissingDividend[],
  monthly: MissingDividend[] = income,
  byHolding: MissingDividend[] = income,
) {
  return decideDividendCard({
    baseCurrency: "OMR",
    income: { missing: income },
    monthly: { missing: monthly },
    byHolding: { missing: byHolding },
    labelFor,
  });
}

describe("decideDividendCard", () => {
  it("shows the derived badge when nothing was left out", () => {
    expect(decide([])).toEqual({ kind: "badge", badge: { variant: "derived" } });
  });

  it("shows a warning, not the badge, when one holding was left out", () => {
    const state = decide([missing("a")]);
    expect(state.kind).toBe("warning");
    if (state.kind === "warning") {
      expect(state.title).toBe("Excludes 1 holding: no exchange rate.");
      expect(state.count).toBe(1);
      expect(state.holdings).toEqual(["ARMCO"]);
      expect(state.description).toBe(
        "Dividends from ARMCO couldn't be converted to OMR, so they are left out of the total, the chart and Income by Holding.",
      );
    }
  });

  it("uses the plural and names up to three holdings", () => {
    const state = decide([missing("a"), missing("b")]);
    expect(state.kind === "warning" && state.title).toBe("Excludes 2 holdings: no exchange rate.");
    expect(state.kind === "warning" && state.description).toContain("ARMCO and BKMB");
  });

  it("names three then 'and N more' beyond three", () => {
    const state = decide(["a", "b", "c", "d", "e"].map((id) => missing(id)));
    expect(state.kind === "warning" && state.title).toBe("Excludes 5 holdings: no exchange rate.");
    expect(state.kind === "warning" && state.description).toContain("ARMCO, BKMB, EMAAR and 2 more");
  });

  it("counts one holding once even if several dividends or several figures missed it", () => {
    const state = decide([missing("a"), missing("a")], [missing("a")], [missing("a")]);
    expect(state.kind === "warning" && state.count).toBe(1);
  });

  it("warns when only the chart or only the by-holding list is incomplete", () => {
    expect(decide([], [missing("a")], []).kind).toBe("warning");
    expect(decide([], [], [missing("a")]).kind).toBe("warning");
  });

  it("still counts a dividend with no holding (named by its currency)", () => {
    const state = decide([missing(undefined, "AED")]);
    expect(state.kind === "warning" && state.holdings).toEqual(["AED dividends"]);
  });

  it("an incomplete figure never carries the derived badge", () => {
    const state = decide([missing("a")]);
    expect(state).not.toHaveProperty("badge");
  });
});

describe("dividendWarningTitle", () => {
  it("singular and plural", () => {
    expect(dividendWarningTitle(1)).toBe("Excludes 1 holding: no exchange rate.");
    expect(dividendWarningTitle(3)).toBe("Excludes 3 holdings: no exchange rate.");
  });
});

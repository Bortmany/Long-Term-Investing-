// A holding's market-value badge must wear the same honest wording as its
// price: an end-of-day Tadawul price is never called "Live" — and a rate
// worked out through the rial shows the older rate's date.
import { describe, expect, it } from "vitest";
import { badgePropsForHoldingValue } from "@/components/source-badge";
import { formatShortDate } from "@/lib/format";
import { fxViaHubNote } from "@/lib/portfolio/fx-note";
import { computePortfolioValue } from "@/lib/portfolio/value";
import type { FxRateInput, PriceInput, TxnInput } from "@/lib/portfolio/types";

const d = (s: string) => new Date(s);

const buy: TxnInput[] = [
  { type: "BUY", instrumentId: "armco", quantity: 100, pricePerUnit: 28, amount: 2800, currency: "SAR", fee: 0, tradeDate: d("2026-01-10") },
];
const price = (source: PriceInput["source"]): PriceInput[] => [
  { instrumentId: "armco", price: 30, currency: "SAR", asOf: d("2026-09-28T12:00:00Z"), source },
];
const sarOmr: FxRateInput = { base: "SAR", quote: "OMR", rate: 0.1, asOf: d("2026-07-01") };
const usdOmr: FxRateInput = { base: "USD", quote: "OMR", rate: 0.4, asOf: d("2026-07-05") };

function valuationFor(source: PriceInput["source"], base: "OMR" | "USD", fx: FxRateInput[]) {
  const value = computePortfolioValue({
    transactions: buy,
    prices: price(source),
    fxRates: fx,
    baseCurrency: base,
  });
  const valuation = value.holdings[0].valuation;
  if (!valuation.ok) throw new Error("expected a valued holding");
  return valuation;
}

describe("per-holding value carries the price's true origin", () => {
  it("keeps priceSource on the valuation", () => {
    expect(valuationFor("TWELVE_DATA", "OMR", [sarOmr]).priceSource).toBe("TWELVE_DATA");
    expect(valuationFor("MANUAL", "OMR", [sarOmr]).priceSource).toBe("MANUAL");
  });
});

describe("badgePropsForHoldingValue", () => {
  it("an end-of-day Tadawul value says end of day with a clock, never plain Live", () => {
    const v = valuationFor("TWELVE_DATA", "OMR", [sarOmr]);
    const props = badgePropsForHoldingValue(v, "TADAWUL");
    expect(props.detail?.text).toBe("Twelve Data · end of day, Sep 28, 2026");
    expect(props.detail?.icon).toBe("clock");
    expect(props.detail?.text).not.toMatch(/^Live/);
  });

  it("matches the price column's wording exactly", () => {
    const v = valuationFor("TWELVE_DATA", "OMR", [sarOmr]);
    const props = badgePropsForHoldingValue(v, "TADAWUL");
    expect(props.detail?.meaning).toBe("This is the closing price from the last trading day.");
  });

  it("an unconfirmed-delay market never shows a number of minutes", () => {
    const v = valuationFor("TWELVE_DATA", "OMR", [sarOmr]);
    const props = badgePropsForHoldingValue(v, "ADX");
    expect(props.detail?.text).toMatch(/^Twelve Data · delayed, as of /);
    expect(props.detail?.text).not.toMatch(/min/);
  });

  it("a typed-in price keeps the Manual badge with its date and no provider wording", () => {
    const v = valuationFor("MANUAL", "OMR", [sarOmr]);
    expect(badgePropsForHoldingValue(v, "TADAWUL")).toEqual({
      variant: "manual",
      date: formatShortDate(d("2026-09-28T12:00:00Z")),
    });
  });

  it("a US (FMP) price stays a plain Live badge", () => {
    const v = valuationFor("FMP", "OMR", [sarOmr]);
    expect(badgePropsForHoldingValue(v, "US")).toEqual({ variant: "live" });
  });

  it("derived sources are unchanged", () => {
    expect(
      badgePropsForHoldingValue({ source: { kind: "derived" } }, "TADAWUL"),
    ).toEqual({ variant: "derived" });
  });
});

describe("fxViaHubNote", () => {
  it("shows 'rate via OMR, as of <older date>' when the route went through the rial", () => {
    const v = valuationFor("MANUAL", "USD", [sarOmr, usdOmr]);
    expect(fxViaHubNote(v)).toBe(`rate via OMR, as of ${formatShortDate(d("2026-07-01"))}`);
  });

  it("shows nothing for a direct rate or no conversion", () => {
    expect(fxViaHubNote(valuationFor("MANUAL", "OMR", [sarOmr]))).toBeNull();
    expect(fxViaHubNote({ fxRateAsOf: null })).toBeNull();
  });
});

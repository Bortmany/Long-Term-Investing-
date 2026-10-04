// Gulf markets UI polish (spec 4b, 5, 6): the sample-price caption rule, the
// dialog hint wording, and the "no rate found" sentence.
import { describe, expect, it } from "vitest";

import { badgePropsForPrice } from "@/components/source-badge";
import {
  SAMPLE_PRICE_CAPTION,
  showSamplePriceCaption,
} from "@/components/stocks/sample-price-caption";
import {
  AUTO_CHANGE_RING_MS,
  CURRENCY_HINT,
  MARKET_HINT,
  PREFILL_HINT,
} from "@/components/stocks/dialog-hints";
import { missingRateSentence } from "@/components/settings/fx-rates-card";

const asOf = new Date("2026-09-28");

describe("sample price caption", () => {
  it("uses the exact spec wording", () => {
    expect(SAMPLE_PRICE_CAPTION).toBe("Sample price for illustration. It is not a real quote.");
  });

  it("shows only for sample prices, never with live or manual badges", () => {
    for (const source of ["sample", "live", "manual"] as const) {
      const { variant } = badgePropsForPrice({ source, asOf }, "ADX");
      expect(showSamplePriceCaption(variant)).toBe(source === "sample");
    }
  });
});

describe("dialog hints", () => {
  it("match the spec wording", () => {
    expect(MARKET_HINT).toBe("The stock exchange this share is traded on.");
    expect(CURRENCY_HINT).toBe("The currency this stock's price is quoted in.");
    expect(PREFILL_HINT).toContain("Looks up the company name and details from FMP.");
    expect(AUTO_CHANGE_RING_MS).toBe(1000);
  });
});

describe("missing exchange rate sentence", () => {
  it("names the currency", () => {
    expect(missingRateSentence("QAR")).toBe("No rate found for QAR. Type one in below.");
  });
});

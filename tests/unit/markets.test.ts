import { describe, it, expect } from "vitest";
import { Currency, Market } from "@prisma/client";
import {
  CURRENCY_VALUES,
  MARKET_VALUES,
  currencyListSentence,
  currencyListText,
  defaultCurrencyForMarket,
  isCurrencyValue,
  isMarketValue,
  marketLabel,
  marketListSentence,
  sortCurrencies,
  sortMarkets,
} from "@/lib/markets";

describe("markets.ts covers every database value", () => {
  it("every Market has a label, a valid default currency and a place in the order", () => {
    for (const m of Object.values(Market)) {
      expect(marketLabel(m).length).toBeGreaterThan(0);
      expect(Object.values(Currency)).toContain(defaultCurrencyForMarket(m));
      expect(MARKET_VALUES).toContain(m);
    }
    expect(MARKET_VALUES).toHaveLength(Object.values(Market).length);
    expect(new Set(MARKET_VALUES).size).toBe(MARKET_VALUES.length);
  });

  it("every Currency has a place in the order", () => {
    for (const c of Object.values(Currency)) expect(CURRENCY_VALUES).toContain(c);
    expect(CURRENCY_VALUES).toHaveLength(Object.values(Currency).length);
  });

  it("orders markets and currencies as the design says", () => {
    expect([...MARKET_VALUES]).toEqual(["US", "MSX", "TADAWUL", "DFM", "ADX", "QSE", "OTHER"]);
    expect([...CURRENCY_VALUES]).toEqual(["OMR", "USD", "SAR", "AED", "QAR"]);
    expect(sortMarkets(Object.values(Market).reverse())).toEqual([...MARKET_VALUES]);
    expect(sortCurrencies(Object.values(Currency).reverse())).toEqual([...CURRENCY_VALUES]);
  });

  it("uses the exact labels and default currencies", () => {
    expect(MARKET_VALUES.map(marketLabel)).toEqual([
      "US",
      "MSX (Muscat)",
      "Tadawul (Saudi)",
      "DFM (Dubai)",
      "ADX (Abu Dhabi)",
      "QSE (Qatar)",
      "Other",
    ]);
    expect(defaultCurrencyForMarket("ADX")).toBe("AED");
    expect(defaultCurrencyForMarket("QSE")).toBe("QAR");
    expect(defaultCurrencyForMarket("MSX")).toBe("OMR");
  });

  it("writes the two error sentences exactly", () => {
    expect(currencyListSentence()).toBe("Pick a valid currency (OMR, USD, SAR, AED or QAR).");
    expect(marketListSentence()).toBe("Pick a market (US, MSX, TADAWUL, DFM, ADX, QSE or OTHER).");
    expect(currencyListText()).toBe("OMR, USD, SAR, AED or QAR");
  });

  it("recognises real market and currency codes only", () => {
    expect(isMarketValue("QSE")).toBe(true);
    expect(isMarketValue("qse")).toBe(false);
    expect(isMarketValue("NYSE")).toBe(false);
    expect(isMarketValue("toString")).toBe(false);
    expect(isCurrencyValue("QAR")).toBe(true);
    expect(isCurrencyValue("EUR")).toBe(false);
  });
});

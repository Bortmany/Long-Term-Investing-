import { describe, expect, it } from "vitest";
import {
  computeCashBalances,
  computeHoldings,
} from "@/lib/portfolio/holdings";
import { computePortfolioValue } from "@/lib/portfolio/value";
import type { FxRateInput, PriceInput, TxnInput } from "@/lib/portfolio/types";

const d = (s: string) => new Date(s);

const transactions: TxnInput[] = [
  { type: "DEPOSIT", instrumentId: null, quantity: null, pricePerUnit: null, amount: 1000, currency: "OMR", fee: 0, tradeDate: d("2025-07-01") },
  { type: "DEPOSIT", instrumentId: null, quantity: null, pricePerUnit: null, amount: 5000, currency: "USD", fee: 0, tradeDate: d("2025-07-02") },
  { type: "BUY", instrumentId: "aapl", quantity: 10, pricePerUnit: 200, amount: 2000, currency: "USD", fee: 5, tradeDate: d("2025-07-10") },
  { type: "BUY", instrumentId: "aapl", quantity: 10, pricePerUnit: 220, amount: 2200, currency: "USD", fee: 5, tradeDate: d("2025-08-10") },
  { type: "SELL", instrumentId: "aapl", quantity: 5, pricePerUnit: 230, amount: 1150, currency: "USD", fee: 3, tradeDate: d("2025-09-10") },
  { type: "DIVIDEND", instrumentId: "aapl", quantity: null, pricePerUnit: null, amount: 10, currency: "USD", fee: 0, tradeDate: d("2025-11-01") },
  { type: "WITHDRAWAL", instrumentId: null, quantity: null, pricePerUnit: null, amount: 100, currency: "OMR", fee: 0, tradeDate: d("2026-01-05") },
  { type: "FEE", instrumentId: null, quantity: null, pricePerUnit: null, amount: 15, currency: "USD", fee: 0, tradeDate: d("2026-02-01") },
];

describe("computeCashBalances", () => {
  it("derives cash per currency: deposits − withdrawals − buys + sells + dividends − fees", () => {
    const balances = computeCashBalances(transactions);
    const usd = balances.find((b) => b.currency === "USD");
    const omr = balances.find((b) => b.currency === "OMR");

    // USD: 5000 − 2000 − 5 − 2200 − 5 + 1150 − 3 + 10 − 15 = 1932
    expect(usd?.amount).toBeCloseTo(1932, 8);
    // OMR: 1000 − 100 = 900
    expect(omr?.amount).toBeCloseTo(900, 8);
  });
});

describe("computeHoldings", () => {
  it("tracks quantity and average-cost basis through buys and sells", () => {
    const holdings = computeHoldings(transactions);
    expect(holdings).toHaveLength(1);
    const aapl = holdings[0];
    expect(aapl.instrumentId).toBe("aapl");
    expect(aapl.quantity).toBeCloseTo(15, 8);
    // Cost: 2005 + 2205 = 4210 for 20 shares → avg 210.5; sell 5 → 4210 − 1052.5 = 3157.5
    expect(aapl.costBasis).toBeCloseTo(3157.5, 8);
    expect(aapl.avgCostPerUnit).toBeCloseTo(210.5, 8);
  });

  it("omits fully sold positions", () => {
    const txns: TxnInput[] = [
      { type: "BUY", instrumentId: "x", quantity: 5, pricePerUnit: 10, amount: 50, currency: "USD", fee: 0, tradeDate: d("2025-01-01") },
      { type: "SELL", instrumentId: "x", quantity: 5, pricePerUnit: 12, amount: 60, currency: "USD", fee: 0, tradeDate: d("2025-02-01") },
    ];
    expect(computeHoldings(txns)).toHaveLength(0);
  });
});

describe("computePortfolioValue", () => {
  const prices: PriceInput[] = [
    { instrumentId: "aapl", price: 230, currency: "USD", asOf: d("2026-07-10"), source: "SEED" },
  ];
  const fxRates: FxRateInput[] = [
    { base: "USD", quote: "OMR", rate: 0.385, asOf: d("2026-07-01") },
  ];

  it("values holdings and cash in the base currency with source badges", () => {
    const result = computePortfolioValue({
      transactions,
      prices,
      fxRates,
      baseCurrency: "OMR",
    });

    // Holdings: 15 × 230 = 3450 USD → 1328.25 OMR
    expect(result.holdingsValue).toBeCloseTo(1328.25, 6);
    // Cash: 1932 USD → 743.82 OMR, plus 900 OMR
    expect(result.cashValue).toBeCloseTo(1932 * 0.385 + 900, 6);
    expect(result.totalValue).toBeCloseTo(1328.25 + 743.82 + 900, 6);
    expect(result.complete).toBe(true);
    expect(result.missing).toHaveLength(0);

    const valuation = result.holdings[0].valuation;
    expect(valuation.ok).toBe(true);
    if (valuation.ok) {
      expect(valuation.source).toEqual({ kind: "sample", asOf: d("2026-07-10") });
    }
  });

  it("marks holdings without a price as missing instead of guessing", () => {
    const result = computePortfolioValue({
      transactions,
      prices: [],
      fxRates,
      baseCurrency: "OMR",
    });
    expect(result.complete).toBe(false);
    expect(result.missing).toContainEqual({
      instrumentId: "aapl",
      reason: "missing_price",
    });
    expect(result.holdings[0].valuation).toEqual({
      ok: false,
      reason: "missing_price",
    });
    // Cash in OMR still counts; USD cash converts fine.
    expect(result.holdingsValue).toBe(0);
  });

  it("reports missing FX rates instead of assuming 1.0", () => {
    const result = computePortfolioValue({
      transactions,
      prices,
      fxRates: [],
      baseCurrency: "OMR",
    });
    expect(result.complete).toBe(false);
    expect(
      result.missing.some(
        (m) => m.reason === "missing_fx_rate" && m.instrumentId === "aapl",
      ),
    ).toBe(true);
    expect(
      result.missing.some(
        (m) => m.reason === "missing_fx_rate" && m.currency === "USD",
      ),
    ).toBe(true);
    // Only the OMR cash is valued.
    expect(result.totalValue).toBeCloseTo(900, 8);
  });
});

// ---------------------------------------------------------------------------
// Step 3: holdings valued through the rial, and holdings with no route.
// Made-up test rates, not real ones.
// ---------------------------------------------------------------------------
describe("computePortfolioValue through the rial", () => {
  const armcoTxns: TxnInput[] = [
    { type: "BUY", instrumentId: "armco", quantity: 250, pricePerUnit: 28, amount: 7000, currency: "SAR", fee: 0, tradeDate: d("2026-01-10") },
  ];
  const armcoPrice: PriceInput[] = [
    { instrumentId: "armco", price: 30, currency: "SAR", asOf: d("2026-07-10"), source: "MANUAL" },
  ];
  const sarOmr: FxRateInput = { base: "SAR", quote: "OMR", rate: 0.1, asOf: d("2026-07-01") };
  const usdOmr: FxRateInput = { base: "USD", quote: "OMR", rate: 0.4, asOf: d("2026-07-05") };

  it("includes a holding valued only through the rial, with the price's own source", () => {
    const result = computePortfolioValue({
      transactions: armcoTxns,
      prices: armcoPrice,
      fxRates: [sarOmr, usdOmr],
      baseCurrency: "USD",
    });
    // 250 × 30 SAR = 7500 SAR → × 0.25 = 1875 USD
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.holdingsValue).toBeCloseTo(1875, 6);
    const valuation = result.holdings[0].valuation;
    expect(valuation.ok).toBe(true);
    if (valuation.ok) {
      expect(valuation.marketValue).toBeCloseTo(1875, 6);
      // The badge still comes from the PRICE (typed-in), not from the FX route.
      expect(valuation.source).toEqual({ kind: "manual", asOf: d("2026-07-10") });
      // The older leg's date, and the route is reported.
      expect(valuation.fxRateAsOf).toEqual(d("2026-07-01"));
      expect(valuation.fxViaHub?.via).toBe("OMR");
    }
    // (the SAR cash left after the buy also converts, so "derived" is there too)
    expect(result.sources).toContainEqual({ kind: "manual", asOf: d("2026-07-10") });
  });

  it("keeps complete:false and lists the holding when there is no route", () => {
    // SAR→OMR exists but OMR→USD does not.
    const result = computePortfolioValue({
      transactions: armcoTxns,
      prices: armcoPrice,
      fxRates: [sarOmr],
      baseCurrency: "USD",
    });
    expect(result.complete).toBe(false);
    expect(result.holdingsValue).toBe(0);
    expect(result.missing).toContainEqual({
      instrumentId: "armco",
      currency: "SAR",
      reason: "missing_fx_rate",
    });
    expect(result.holdings[0].valuation).toEqual({
      ok: false,
      reason: "missing_fx_rate",
      from: "SAR",
      to: "USD",
    });
  });

  it("values a QAR holding in OMR with a direct QAR/OMR row", () => {
    const result = computePortfolioValue({
      transactions: [
        { type: "BUY", instrumentId: "qnbk", quantity: 100, pricePerUnit: 18, amount: 1800, currency: "QAR", fee: 0, tradeDate: d("2026-02-01") },
      ],
      prices: [{ instrumentId: "qnbk", price: 20, currency: "QAR", asOf: d("2026-07-10"), source: "SEED" }],
      fxRates: [{ base: "QAR", quote: "OMR", rate: 0.1, asOf: d("2026-07-01") }],
      baseCurrency: "OMR",
    });
    expect(result.complete).toBe(true);
    expect(result.holdingsValue).toBeCloseTo(200, 8);
  });
});

import { describe, expect, it } from "vitest";

import {
  evaluatePriceAlert,
  evaluateThesisAlert,
  shouldRearmThesisAlert,
  type PriceAlertForEval,
  type PriceAlertInput,
  type ThesisAlertForEval,
} from "@/lib/alerts/evaluate";

const NOW = new Date("2026-07-19T12:00:00Z");

function liveQuote(price: number, overrides: Partial<PriceAlertInput["quote"]> = {}): PriceAlertInput {
  return {
    quote: { price, currency: "OMR", asOf: NOW, source: "live", ...overrides },
    previousClose: null,
  };
}

describe("evaluatePriceAlert — PRICE_ABOVE", () => {
  const alert: PriceAlertForEval = { kind: "PRICE_ABOVE", threshold: 0.4, ticker: "BKMB" };

  it("fires when the price is exactly at the threshold (inclusive compare)", () => {
    const result = evaluatePriceAlert(alert, liveQuote(0.4), NOW);
    expect(result.fired).toBe(true);
  });

  it("fires when the price is above the threshold", () => {
    const result = evaluatePriceAlert(alert, liveQuote(0.45), NOW);
    expect(result.fired).toBe(true);
    if (result.fired) {
      expect(result.title).toContain("BKMB");
      expect(result.body).toContain("OMR 0.450");
    }
  });

  it("does not fire below the threshold, and says so honestly", () => {
    const result = evaluatePriceAlert(alert, liveQuote(0.39), NOW);
    expect(result.fired).toBe(false);
    if (!result.fired) expect(result.outcome).toContain("still below");
  });
});

describe("evaluatePriceAlert — PRICE_BELOW", () => {
  const alert: PriceAlertForEval = { kind: "PRICE_BELOW", threshold: 0.4, ticker: "BKMB" };

  it("fires when the price is exactly at the threshold (inclusive compare)", () => {
    expect(evaluatePriceAlert(alert, liveQuote(0.4), NOW).fired).toBe(true);
  });

  it("fires when the price is below the threshold", () => {
    expect(evaluatePriceAlert(alert, liveQuote(0.35), NOW).fired).toBe(true);
  });

  it("does not fire above the threshold", () => {
    const result = evaluatePriceAlert(alert, liveQuote(0.5), NOW);
    expect(result.fired).toBe(false);
    if (!result.fired) expect(result.outcome).toContain("still above");
  });
});

describe("evaluatePriceAlert — THE CORE GUARANTEE: sample data never fires", () => {
  it("a PRICE_ABOVE alert never fires on a sample-sourced quote, even crossed deep", () => {
    const alert: PriceAlertForEval = { kind: "PRICE_ABOVE", threshold: 0.4, ticker: "BKMB" };
    const result = evaluatePriceAlert(alert, liveQuote(50, { source: "sample" }), NOW);
    expect(result.fired).toBe(false);
    if (!result.fired) expect(result.outcome).toBe("Not checked — only sample data is available for this stock.");
  });

  it("a PRICE_BELOW alert never fires on a sample-sourced quote, even crossed deep", () => {
    const alert: PriceAlertForEval = { kind: "PRICE_BELOW", threshold: 100, ticker: "AAPL" };
    const result = evaluatePriceAlert(alert, liveQuote(0.01, { source: "sample" }), NOW);
    expect(result.fired).toBe(false);
  });

  it("a DAY_DROP alert never fires on a sample-sourced quote even with a crossing previous close", () => {
    const alert: PriceAlertForEval = { kind: "DAY_DROP", threshold: 5, ticker: "AAPL" };
    const input: PriceAlertInput = {
      quote: { price: 50, currency: "USD", asOf: NOW, source: "sample" },
      previousClose: { price: 100, asOf: new Date("2026-07-18") },
    };
    const result = evaluatePriceAlert(alert, input, NOW);
    expect(result.fired).toBe(false);
  });

  it("manual-sourced quotes DO get evaluated normally (not swept up by the sample guard)", () => {
    const alert: PriceAlertForEval = { kind: "PRICE_ABOVE", threshold: 0.4, ticker: "BKMB" };
    const result = evaluatePriceAlert(alert, liveQuote(0.45, { source: "manual" }), NOW);
    expect(result.fired).toBe(true);
  });
});

describe("evaluatePriceAlert — DAY_DROP", () => {
  const alert: PriceAlertForEval = { kind: "DAY_DROP", threshold: 5, ticker: "AAPL" };

  it("never fires without a previous close — honest outcome, not a fabricated drop", () => {
    const input: PriceAlertInput = {
      quote: { price: 90, currency: "USD", asOf: NOW, source: "live" },
      previousClose: null,
    };
    const result = evaluatePriceAlert(alert, input, NOW);
    expect(result.fired).toBe(false);
    if (!result.fired) {
      expect(result.outcome).toBe(
        "Not checked — no previous closing price is available yet to compare against.",
      );
    }
  });

  it("fires when the drop is exactly at the threshold (inclusive compare)", () => {
    const input: PriceAlertInput = {
      quote: { price: 95, currency: "USD", asOf: NOW, source: "live" },
      previousClose: { price: 100, asOf: new Date("2026-07-18") },
    };
    const result = evaluatePriceAlert(alert, input, NOW);
    expect(result.fired).toBe(true);
  });

  it("fires when the drop exceeds the threshold", () => {
    const input: PriceAlertInput = {
      quote: { price: 80, currency: "USD", asOf: NOW, source: "live" },
      previousClose: { price: 100, asOf: new Date("2026-07-18") },
    };
    const result = evaluatePriceAlert(alert, input, NOW);
    expect(result.fired).toBe(true);
    if (result.fired) expect(result.title).toContain("20.0%");
  });

  it("does not fire on a smaller drop", () => {
    const input: PriceAlertInput = {
      quote: { price: 98, currency: "USD", asOf: NOW, source: "live" },
      previousClose: { price: 100, asOf: new Date("2026-07-18") },
    };
    const result = evaluatePriceAlert(alert, input, NOW);
    expect(result.fired).toBe(false);
  });

  it("does not fire when the price rose (a negative drop)", () => {
    const input: PriceAlertInput = {
      quote: { price: 110, currency: "USD", asOf: NOW, source: "live" },
      previousClose: { price: 100, asOf: new Date("2026-07-18") },
    };
    const result = evaluatePriceAlert(alert, input, NOW);
    expect(result.fired).toBe(false);
    if (!result.fired) expect(result.outcome).not.toContain("-");
  });
});

describe("evaluateThesisAlert", () => {
  const alert: ThesisAlertForEval = { intervalDays: 90, ticker: "MSFT" };

  it("fires once the interval has fully elapsed since the last check", () => {
    const result = evaluateThesisAlert(
      alert,
      { lastCheckedAt: new Date("2026-04-20T12:00:00Z"), thesisCreatedAt: new Date("2026-01-01") },
      NOW,
    );
    expect(result.fired).toBe(true);
  });

  it("does not fire before the interval has elapsed", () => {
    const result = evaluateThesisAlert(
      alert,
      { lastCheckedAt: new Date("2026-06-01T12:00:00Z"), thesisCreatedAt: new Date("2026-01-01") },
      NOW,
    );
    expect(result.fired).toBe(false);
    if (!result.fired) expect(result.outcome).toContain("day");
  });

  it("falls back to the thesis's createdAt when it has never been checked", () => {
    const neverChecked = evaluateThesisAlert(
      alert,
      { lastCheckedAt: null, thesisCreatedAt: new Date("2026-04-15T12:00:00Z") },
      NOW,
    );
    expect(neverChecked.fired).toBe(true);
    if (neverChecked.fired) expect(neverChecked.body).toContain("never been checked");
  });
});

describe("shouldRearmThesisAlert", () => {
  it("re-arms once a newer ThesisCheck exists than the alert's last trigger", () => {
    expect(
      shouldRearmThesisAlert(
        { lastTriggeredAt: new Date("2026-04-01") },
        new Date("2026-04-15"),
      ),
    ).toBe(true);
  });

  it("does not re-arm when the newest check is not newer than the last trigger", () => {
    expect(
      shouldRearmThesisAlert(
        { lastTriggeredAt: new Date("2026-04-15") },
        new Date("2026-04-01"),
      ),
    ).toBe(false);
    expect(
      shouldRearmThesisAlert(
        { lastTriggeredAt: new Date("2026-04-15") },
        new Date("2026-04-15"),
      ),
    ).toBe(false);
  });

  it("does not re-arm an alert that was never triggered", () => {
    expect(shouldRearmThesisAlert({ lastTriggeredAt: null }, new Date("2026-04-15"))).toBe(false);
  });

  it("does not re-arm when there is no check at all", () => {
    expect(shouldRearmThesisAlert({ lastTriggeredAt: new Date("2026-04-01") }, null)).toBe(false);
  });
});

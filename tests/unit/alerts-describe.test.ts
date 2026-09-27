// The alert-honesty rule applied to wording: a fired alert must explain
// itself with what actually happened next to the threshold the owner set —
// and must say nothing at all rather than invent a figure it doesn't have.
import { describe, expect, it } from "vitest";
import {
  describeAlertThreshold,
  describeAlertTrigger,
  describeFiredAlert,
  savedAlertRule,
} from "@/lib/alerts/describe";
import { formatMoney } from "@/lib/format";

describe("describeAlertThreshold", () => {
  it("states a price-above threshold in the instrument's currency", () => {
    expect(
      describeAlertThreshold({
        kind: "PRICE_ABOVE",
        threshold: 200,
        currency: "USD",
        intervalDays: null,
      }),
    ).toBe(`your alert was set at ${formatMoney(200, "USD")} or above`);
  });

  it("states a price-below threshold", () => {
    expect(
      describeAlertThreshold({
        kind: "PRICE_BELOW",
        threshold: 0.4,
        currency: "OMR",
        intervalDays: null,
      }),
    ).toBe(`your alert was set at ${formatMoney(0.4, "OMR")} or below`);
  });

  it("states a day-drop threshold as a percent", () => {
    expect(
      describeAlertThreshold({
        kind: "DAY_DROP",
        threshold: 10,
        currency: "USD",
        intervalDays: null,
      }),
    ).toBe("your alert was set at 10% or more in one day");
  });

  it("states a thesis-review interval in days", () => {
    expect(
      describeAlertThreshold({
        kind: "THESIS_REVIEW_DUE",
        threshold: null,
        currency: null,
        intervalDays: 90,
      }),
    ).toBe("your alert asks for a review every 90 days");
  });

  it("says nothing rather than guess when no number was recorded", () => {
    expect(
      describeAlertThreshold({
        kind: "DAY_DROP",
        threshold: null,
        currency: "USD",
        intervalDays: null,
      }),
    ).toBeNull();
    expect(
      describeAlertThreshold({
        kind: "THESIS_REVIEW_DUE",
        threshold: null,
        currency: null,
        intervalDays: null,
      }),
    ).toBeNull();
  });
});

describe("describeAlertTrigger", () => {
  it("puts the real drop next to the threshold that was set", () => {
    expect(
      describeAlertTrigger({
        kind: "DAY_DROP",
        threshold: 10,
        currency: "USD",
        intervalDays: null,
        happened: "AAPL dropped 12.3% today",
      }),
    ).toBe("AAPL dropped 12.3% today — your alert was set at 10% or more in one day.");
  });

  it("never doubles the full stop of the recorded sentence", () => {
    expect(
      describeAlertTrigger({
        kind: "DAY_DROP",
        threshold: 10,
        currency: "USD",
        intervalDays: null,
        happened: "AAPL dropped 12.3% today.",
      }),
    ).toBe("AAPL dropped 12.3% today — your alert was set at 10% or more in one day.");
  });

  it("falls back to the threshold alone when nothing was recorded about the trigger", () => {
    expect(
      describeAlertTrigger({
        kind: "PRICE_BELOW",
        threshold: 0.4,
        currency: "OMR",
        intervalDays: null,
        happened: null,
      }),
    ).toBe(`Your alert was set at ${formatMoney(0.4, "OMR")} or below.`);
  });

  it("repeats only the recorded sentence when the threshold is missing — no invented number", () => {
    const line = describeAlertTrigger({
      kind: "PRICE_ABOVE",
      threshold: null,
      currency: "USD",
      intervalDays: null,
      happened: "AAPL rose above the level you set",
    });
    expect(line).toBe("AAPL rose above the level you set.");
    expect(line).not.toContain("0");
  });

  it("returns nothing at all when there is neither an outcome nor a threshold", () => {
    expect(
      describeAlertTrigger({
        kind: "PRICE_ABOVE",
        threshold: null,
        currency: null,
        intervalDays: null,
        happened: null,
      }),
    ).toBeNull();
  });
});

describe("describeFiredAlert — only ever from the settings saved when it fired", () => {
  it("states the saved threshold, with the recorded outcome", () => {
    const saved = savedAlertRule({
      alertKind: "DAY_DROP",
      alertThreshold: 10,
      alertIntervalDays: null,
      priceCurrency: "USD",
    });
    expect(describeFiredAlert(saved, "AAPL dropped 12.3% today")).toBe(
      "AAPL dropped 12.3% today — your alert was set at 10% or more in one day.",
    );
  });

  it("an older notification with no saved settings gets no 'set at' line", () => {
    const saved = savedAlertRule({
      alertKind: null,
      alertThreshold: null,
      alertIntervalDays: null,
      priceCurrency: "OMR",
    });
    expect(saved).toBeNull();
    expect(describeFiredAlert(saved)).toBeNull();
    const withOutcome = describeFiredAlert(saved, "BKMB fell below the level you set");
    expect(withOutcome).toBe("BKMB fell below the level you set.");
    expect(withOutcome).not.toContain("set at");
  });
});

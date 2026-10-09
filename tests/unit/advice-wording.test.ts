// Advice-wording decision (docs/decisions/advice-wording.md): old stored
// AiAnalysis rows (BUY/HOLD/SELL, suggestedAllocationPct) must still parse
// and render, now with the Positive / Neutral / Negative labels and none of
// the retired phrases.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BuyAnalysisPanel } from "@/components/committee/buy-analysis-panel";
import { SellAnalysisPanel } from "@/components/committee/sell-analysis-panel";
import { VerdictChip } from "@/components/committee/verdict-chip";
import { AiDisclaimer } from "@/components/ai-disclaimer";
import {
  buyAnalysisSchema,
  committeeOutputSchema,
  personaVoteSchema,
  sellAnalysisSchema,
} from "@/lib/ai/schemas";

const stored = {
  createdAt: new Date("2026-09-01T10:00:00Z"),
  model: "claude-test-model",
  dataAsOf: new Date("2026-08-31T00:00:00Z"),
};

const OLD_BUY_ROW = {
  score: 72,
  fairValueEstimate: { value: 120, assumptions: ["DCF with 8% discount rate"] },
  marginOfSafetyPct: 10,
  upsidePct: 25,
  downsidePct: -15,
  suggestedAllocationPct: 5, // retired field, still present in old rows
  confidence: 70,
  alternatives: [{ ticker: "MSFT", why: "Similar profile" }],
};

const OLD_VOTE = {
  recommendation: "SELL",
  confidence: 60,
  reasoning: "r",
  evidence: ["e"],
  risks: ["k"],
  counterarguments: ["c"],
};

const RETIRED = [
  "Buy Analysis",
  "Sell Analysis",
  "Buy Score",
  "Sell Score",
  "Reasons to Sell",
  "Suggested position size",
  "Alternatives",
  "Recommendations",
];

describe("old stored rows still parse", () => {
  it("accepts an old Buy analysis row with suggestedAllocationPct", () => {
    expect(buyAnalysisSchema.safeParse(OLD_BUY_ROW).success).toBe(true);
  });

  it("accepts a new Buy analysis row without suggestedAllocationPct", () => {
    const { suggestedAllocationPct: _unused, ...rest } = OLD_BUY_ROW;
    void _unused;
    expect(buyAnalysisSchema.safeParse(rest).success).toBe(true);
  });

  it("accepts an old Sell analysis row", () => {
    const row = { sellScore: 40, reasons: [], counterarguments: [], confidence: 50 };
    expect(sellAnalysisSchema.safeParse(row).success).toBe(true);
  });

  it("keeps stored BUY/HOLD/SELL and maps new POSITIVE/NEUTRAL/NEGATIVE onto them", () => {
    expect(personaVoteSchema.parse(OLD_VOTE).recommendation).toBe("SELL");
    expect(personaVoteSchema.parse({ ...OLD_VOTE, recommendation: "POSITIVE" }).recommendation).toBe("BUY");
    expect(personaVoteSchema.parse({ ...OLD_VOTE, recommendation: "NEUTRAL" }).recommendation).toBe("HOLD");
    expect(personaVoteSchema.safeParse({ ...OLD_VOTE, recommendation: "MAYBE" }).success).toBe(false);
  });

  it("accepts an old committee row", () => {
    const row = {
      verdict: "HOLD",
      consensusScore: 50,
      votes: [{ persona: "value", ...OLD_VOTE }],
      disagreements: ["d"],
      wouldChangeVerdict: [],
      thesisAssessment: null,
    };
    expect(committeeOutputSchema.parse(row).verdict).toBe("HOLD");
  });
});

describe("old stored rows render with the new wording", () => {
  it("shows Positive / Neutral / Negative for stored BUY / HOLD / SELL", () => {
    const html = (v: "BUY" | "HOLD" | "SELL") =>
      renderToStaticMarkup(createElement(VerdictChip, { verdict: v, size: "lg" }));
    expect(html("BUY")).toContain("Committee view: Positive");
    expect(html("HOLD")).toContain("Neutral");
    expect(html("SELL")).toContain("Negative");
    expect(html("BUY")).not.toMatch(/\bBUY\b/);
  });

  it("renders an old Buy row as an Upside check with no position-size line", () => {
    const output = buyAnalysisSchema.parse(OLD_BUY_ROW);
    const html = renderToStaticMarkup(
      createElement(BuyAnalysisPanel, {
        instrumentId: "i",
        instrumentCurrency: "USD",
        hasKey: true,
        analysis: stored,
        output,
        currentPrice: { ok: false, reason: "test" },
        readOnly: true,
      }),
    );
    expect(html).toContain("Upside check");
    expect(html).toContain("Opportunity score");
    expect(html).toContain("AI fair-value estimate");
    expect(html).toContain("Similar companies to compare");
    expect(html).toContain("not a personal recommendation");
    for (const phrase of RETIRED) expect(html).not.toContain(phrase);
    expect(html).not.toContain("position size");
  });

  it("renders an old Sell row as a Downside check", () => {
    const output = sellAnalysisSchema.parse({
      sellScore: 40,
      reasons: [{ point: "p", evidence: ["e"] }],
      counterarguments: [],
      confidence: 50,
    });
    const html = renderToStaticMarkup(
      createElement(SellAnalysisPanel, {
        instrumentId: "i",
        hasKey: true,
        analysis: stored,
        output,
        readOnly: true,
      }),
    );
    expect(html).toContain("Downside check");
    expect(html).toContain("Warning-signs score");
    expect(html).toContain("Reasons for concern");
    for (const phrase of RETIRED) expect(html).not.toContain(phrase);
  });

  it("uses the approved disclaimer text exactly", () => {
    const html = renderToStaticMarkup(createElement(AiDisclaimer));
    expect(html).toContain(
      "AI-generated research for education only, not a personal recommendation.",
    );
    expect(html).toContain("InvestIQ is not licensed to give investment advice in Oman, Saudi Arabia, the US or elsewhere.");
  });
});

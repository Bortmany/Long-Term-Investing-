import { describe, expect, it } from "vitest";

import { buildWeeklyBriefEmail } from "@/lib/email/weekly-brief";
import { formatIsoWeek } from "@/lib/format";

const PERIOD = "2026-W29";
const APP_BASE_URL = "https://app.investiq.example";
const FIGURE_FREE_SUMMARY =
  "Your portfolio held steady this week with no major changes to note.";

describe("buildWeeklyBriefEmail — subject", () => {
  it("uses the friendly week label, not the raw ISO period string", () => {
    const email = buildWeeklyBriefEmail(
      { id: "review-1", period: PERIOD, summary: FIGURE_FREE_SUMMARY },
      APP_BASE_URL,
    );
    expect(email.subject).toBe(`InvestIQ — your weekly review, ${formatIsoWeek(PERIOD)}`);
    expect(email.subject).not.toContain(PERIOD);
  });
});

describe("buildWeeklyBriefEmail — html", () => {
  it("escapes a <script> tag embedded in the summary", () => {
    const email = buildWeeklyBriefEmail(
      { id: "review-1", period: PERIOD, summary: '<script>alert("x")</script>' },
      APP_BASE_URL,
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("contains a link to the review in the app", () => {
    const email = buildWeeklyBriefEmail(
      { id: "review-42", period: PERIOD, summary: FIGURE_FREE_SUMMARY },
      APP_BASE_URL,
    );
    expect(email.html).toContain(`${APP_BASE_URL}/reviews/review-42`);
    expect(email.text).toContain(`${APP_BASE_URL}/reviews/review-42`);
  });

  it("always contains the fixed 'figures live in the app' reminder sentence", () => {
    const email = buildWeeklyBriefEmail(
      { id: "review-1", period: PERIOD, summary: FIGURE_FREE_SUMMARY },
      APP_BASE_URL,
    );
    const reminder =
      "All figures live in the app, not in this email — so you never act on a stale number.";
    expect(email.html).toContain(reminder);
    expect(email.text).toContain(reminder);
  });

  it("contains no currency amounts when the summary itself has none (the template never adds one)", () => {
    const email = buildWeeklyBriefEmail(
      { id: "review-1", period: PERIOD, summary: FIGURE_FREE_SUMMARY },
      APP_BASE_URL,
    );
    const currencyAmount = /(OMR|USD|SAR|AED)\s*\d/;
    expect(email.html).not.toMatch(currencyAmount);
    expect(email.text).not.toMatch(currencyAmount);
    expect(email.subject).not.toMatch(currencyAmount);
  });
});

describe("buildWeeklyBriefEmail — only the summary, week label, and link enter the template", () => {
  it("does not leak the raw period string or any other field into the html", () => {
    const email = buildWeeklyBriefEmail(
      { id: "review-1", period: PERIOD, summary: FIGURE_FREE_SUMMARY },
      APP_BASE_URL,
    );
    expect(email.html).not.toContain(PERIOD);
    expect(email.html).toContain(FIGURE_FREE_SUMMARY);
  });
});

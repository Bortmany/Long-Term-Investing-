// Pure builder for the weekly-review email (BUILD-PLAN.md Phase 7) — no I/O,
// no Date.now(), fully deterministic from its arguments, so it's trivially
// unit-testable (tests/unit/weekly-brief-email.test.ts).
//
// HARD RULE: this template interpolates ONLY three things — the review's own
// AI-authored summary, its ISO week label, and the link back to the review
// in the app. Nothing else about the user or their portfolio ever enters an
// email (no balances, no holdings, no dollar figures of any kind) — the
// fixed reminder sentence below exists precisely so a stale number in an
// inbox can never be mistaken for a live one.

import { formatIsoWeek } from "@/lib/format";
import { escapeHtml } from "./send";

export type WeeklyBriefReview = {
  id: string;
  /** ISO week period, e.g. "2026-W29". */
  period: string;
  /** The AI-authored summary already persisted on the WeeklyReview row. */
  summary: string;
};

export type WeeklyBriefEmail = {
  subject: string;
  text: string;
  html: string;
};

const REMINDER_SENTENCE =
  "All figures live in the app, not in this email — so you never act on a stale number.";

/** Build the subject/text/html for one weekly-review notification email. */
export function buildWeeklyBriefEmail(
  review: WeeklyBriefReview,
  appBaseUrl: string,
): WeeklyBriefEmail {
  const weekLabel = formatIsoWeek(review.period);
  const link = `${appBaseUrl}/reviews/${review.id}`;

  const subject = `InvestIQ — your weekly review, ${weekLabel}`;

  const text = [
    `Your weekly review for ${weekLabel} is ready.`,
    "",
    review.summary,
    "",
    `Read the full review: ${link}`,
    "",
    REMINDER_SENTENCE,
  ].join("\n");

  const html = [
    `<p>Your weekly review for ${escapeHtml(weekLabel)} is ready.</p>`,
    `<p>${escapeHtml(review.summary)}</p>`,
    `<p><a href="${escapeHtml(link)}">Read the full review</a></p>`,
    `<p style="color:#64748b;font-size:13px;">${escapeHtml(REMINDER_SENTENCE)}</p>`,
  ].join("\n");

  return { subject, text, html };
}

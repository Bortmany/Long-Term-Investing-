// ISO-8601 week helpers for the Weekly Review (BUILD-PLAN.md Phase 6).
// Pure, no I/O — the classic edge cases (year boundary, 53-week years, leap
// years) are all covered by tests/unit/review-period.test.ts.
//
// ISO-8601 week rule: weeks start Monday; week 1 of a year is the week that
// contains that year's first Thursday (equivalently, the week containing
// January 4th). Because of this, the FIRST days of January can belong to the
// LAST week of the PREVIOUS year, and the LAST days of December can belong
// to week 1 of the NEXT year — both are exercised below.

/** ISO day of week for a UTC date: Monday = 1 … Sunday = 7. */
function isoDayOfWeekUtc(date: Date): number {
  const day = date.getUTCDay(); // Sunday = 0 … Saturday = 6
  return day === 0 ? 7 : day;
}

/**
 * The ISO week-year and week number for `date`. Standard algorithm: shift to
 * the Thursday of the same ISO week (Thursday's calendar year IS the ISO
 * week-year, by construction — week 1 always contains a Thursday in
 * January), then count whole weeks from that year's January 1st.
 */
function isoWeekOf(date: Date): { isoYear: number; isoWeek: number } {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = isoDayOfWeekUtc(target);
  target.setUTCDate(target.getUTCDate() + 4 - dayNum); // Thursday of this ISO week
  const isoYear = target.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { isoYear, isoWeek };
}

function formatPeriod(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * How many ISO weeks `isoYear` has (52 or 53). Relies on the well-known
 * ISO-8601 fact that December 28th always falls in that year's LAST ISO
 * week — so asking isoWeekOf() for Dec 28 directly gives the answer.
 */
function isoWeeksInYear(isoYear: number): number {
  return isoWeekOf(new Date(Date.UTC(isoYear, 11, 28))).isoWeek;
}

/** The current ISO week period, e.g. "2026-W29". */
export function currentIsoPeriod(now: Date = new Date()): string {
  const { isoYear, isoWeek } = isoWeekOf(now);
  return formatPeriod(isoYear, isoWeek);
}

/**
 * The ISO week period immediately before `period` — crossing a year boundary
 * (and landing on a 52- or 53-week prior year, whichever that year actually
 * has) when `period` is week 1. Throws on a malformed period rather than
 * guessing (never fabricate a date, same discipline as formatIsoWeek).
 */
export function previousPeriod(period: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(period);
  if (!match) {
    throw new Error(`Not an ISO week period: "${period}" (expected e.g. "2026-W28").`);
  }
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) {
    throw new Error(`ISO week number out of range in "${period}" (must be 01–53).`);
  }

  if (week > 1) {
    return formatPeriod(year, week - 1);
  }
  const priorYear = year - 1;
  return formatPeriod(priorYear, isoWeeksInYear(priorYear));
}

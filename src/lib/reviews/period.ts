// ISO-8601 week period math (pure, no I/O) — the REVERSE of `formatIsoWeek`
// in src/lib/format.ts (that one turns a period string like "2026-W28" into
// a human date range; this one turns a Date into that period string).
//
// Standard ISO-8601 week algorithm: weeks start on Monday, and week 1 of a
// year is the week containing that year's first Thursday. A date early in
// January can belong to week 52/53 of the PREVIOUS ISO year, and a date late
// in December can belong to week 1 of the NEXT ISO year — see the boundary
// tests in tests/unit/reviews/period.test.ts.

function isoWeekInfo(date: Date): { isoYear: number; week: number } {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday=0..Sunday=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // move to this week's Thursday
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return { isoYear, week };
}

/**
 * The ISO week period label for a given date, e.g. "2026-W28". Matches the
 * shape `formatIsoWeek` (src/lib/format.ts) expects to parse back.
 */
export function isoWeekPeriod(date: Date): string {
  const { isoYear, week } = isoWeekInfo(date);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

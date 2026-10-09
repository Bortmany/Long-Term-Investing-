// Display formatting helpers (pages stay thin; formatting lives here).

/**
 * Format a money amount for display, e.g. formatMoney(24850, "OMR")
 * → "OMR 24,850.000". OMR is conventionally shown to 3 decimals (its minor
 * unit, the baisa, is 1/1000); other currencies use 2 decimals.
 */
export function formatMoney(amount: number, currency: string): string {
  const decimals = currency === "OMR" ? 3 : 2;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  return `${currency} ${formatted}`;
}

/** Format a share quantity: whole numbers stay whole, fractions keep up to 4 decimals. */
export function formatQuantity(quantity: number): string {
  // Not a real number: a dash, never "NaN" or "Infinity".
  if (!Number.isFinite(quantity)) return "—";
  // A true zero (including negative zero) is just "0".
  if (quantity === 0) return "0";
  const normal = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(quantity);
  if (normal !== "0" && normal !== "-0") return normal;
  // A real holding is never shown as a fake zero: show up to 8 decimals, and
  // below that say "less than".
  if (Math.abs(quantity) < 0.00000001) {
    return quantity < 0 ? ">-0.00000001" : "<0.00000001";
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(quantity);
}

/** The widest a quantity may be on a card before it is shortened (fits a 150px column at 14px). */
export const QUANTITY_CARD_MAX_CHARS = 14;

/**
 * Quantity for phone cards only: the full number when it fits (14 characters
 * or fewer), otherwise a short form like "123.46B". Cards show the exact
 * `formatQuantity` value in the element's title and accessible label.
 */
export function formatQuantityCompact(quantity: number): string {
  const full = formatQuantity(quantity);
  if (full.length <= QUANTITY_CARD_MAX_CHARS || !Number.isFinite(quantity)) return full;
  const abs = Math.abs(quantity);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, letter] of units) {
    if (abs >= size) {
      const short = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(quantity / size);
      return `${short}${letter}`;
    }
  }
  return full;
}

/** Short human date, e.g. "Jul 10, 2026" — used by the manual source badge. */
export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Format a percentage to one decimal place, e.g. formatPercent(9.44) → "9.4%".
 * With { signed: true }, positive values get a "+" prefix (negatives already
 * carry "-" from the number itself): formatPercent(9.4, { signed: true })
 * → "+9.4%".
 */
export function formatPercent(value: number, opts?: { signed?: boolean }): string {
  let fixed = value.toFixed(1);
  // A tiny negative that rounds to zero shouldn't display as "-0.0%".
  if (fixed === "-0.0") {
    fixed = "0.0";
  }
  const sign = opts?.signed && value > 0 ? "+" : "";
  return `${sign}${fixed}%`;
}

// --- ISO week label helpers (formatIsoWeek) --------------------------------

/** ISO day of week for a UTC date: Monday = 1 … Sunday = 7. */
function isoDayOfWeekUtc(date: Date): number {
  const day = date.getUTCDay(); // Sunday = 0 … Saturday = 6
  return day === 0 ? 7 : day;
}

/** The Monday (UTC) that starts ISO week `week` of ISO year `year`. */
function mondayOfIsoWeek(year: number, week: number): Date {
  // ISO-8601: January 4th is always inside week 1 of its year, so week 1's
  // Monday is Jan 4 minus however far into the week Jan 4 falls.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (isoDayOfWeekUtc(jan4) - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

/** "Jul" / "Dec" etc. for a UTC date. */
function shortMonthUtc(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date);
}

/**
 * Turn an ISO week period string like "2026-W28" into an owner-friendly
 * label like "Week of Jul 6–12, 2026" (real ISO-8601 week math, Monday
 * start). Raw ISO week strings are never shown in the UI.
 *
 * Throws on a malformed period rather than guessing a date range — never
 * display a fabricated figure, dates included.
 */
export function formatIsoWeek(period: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(period);
  if (!match) {
    throw new Error(`Not an ISO week period: "${period}" (expected e.g. "2026-W28").`);
  }
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) {
    throw new Error(`ISO week number out of range in "${period}" (must be 01–53).`);
  }

  const monday = mondayOfIsoWeek(year, week);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const startMonth = shortMonthUtc(monday);
  const endMonth = shortMonthUtc(sunday);
  const startDay = monday.getUTCDate();
  const endDay = sunday.getUTCDate();
  const startYear = monday.getUTCFullYear();
  const endYear = sunday.getUTCFullYear();

  if (startYear !== endYear) {
    // Week spans New Year: "Week of Dec 29, 2025 – Jan 4, 2026".
    return `Week of ${startMonth} ${startDay}, ${startYear} – ${endMonth} ${endDay}, ${endYear}`;
  }
  if (startMonth !== endMonth) {
    // Week spans a month boundary: "Week of Jun 29 – Jul 5, 2026".
    return `Week of ${startMonth} ${startDay} – ${endMonth} ${endDay}, ${endYear}`;
  }
  // Same month: "Week of Jul 6–12, 2026".
  return `Week of ${startMonth} ${startDay}–${endDay}, ${endYear}`;
}

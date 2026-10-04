// THE display rule: the only code that may turn a stored row into a verdict.
// Pure: no database, no network. A verdict is shown only if a real, recent
// row from the ACTIVE supplier exists on a covered exchange. Nothing else can
// produce one: no default, no "assume compliant", no other source.

import { isCoveredMarket } from "./coverage";
import type { ShariaDisplay, StoredShariaScreen } from "./types";

/** A verdict older than this many whole UTC days is not shown. */
export const MAX_AGE_DAYS = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

/** Whole UTC days between the data date and now (negative = in the future). */
export function ageInDays(asOf: Date, now: Date): number {
  return utcDay(now) - utcDay(asOf);
}

export function resolveShariaDisplay(input: {
  /** The stored row for THIS instrument and the ACTIVE supplier, or none. */
  row: StoredShariaScreen | null;
  /** The supplier that is active right now (null = unknown vendor setting). */
  activeVendor: string | null;
  market: string;
  /** True when the active supplier has its key. */
  configured: boolean;
  now: Date;
  onWarn?: (message: string) => void;
}): ShariaDisplay {
  const { row, activeVendor, market, configured, now } = input;

  // 1. Not set up: even old rows are ignored.
  if (!configured || !activeVendor) return { state: "not_screened", reason: "not_set_up" };
  // 2. Exchange not covered: even if a row somehow exists.
  if (!isCoveredMarket(market)) return { state: "not_screened", reason: "not_covered" };
  // 3. No row from the active supplier (rows from another supplier are ignored).
  if (!row || row.source !== activeVendor) return { state: "not_screened", reason: "no_verdict" };
  // A verdict with no method name is never shown (we would be guessing the method).
  if (!row.methodName.trim()) return { state: "not_screened", reason: "no_verdict" };

  const age = ageInDays(row.asOf, now);
  // 4. A data date in the future is bad data.
  if (age < 0) {
    input.onWarn?.("Sharia verdict has a data date in the future; treating as no verdict");
    return { state: "not_screened", reason: "no_verdict" };
  }
  // Exactly 100 days old still shows; 101 does not.
  if (age > MAX_AGE_DAYS) {
    return { state: "not_screened", reason: "too_old", staleAsOf: row.asOf };
  }
  // 5. Otherwise exactly as stored.
  if (row.verdict === "COMPLIANT") return { state: "compliant", row };
  if (row.verdict === "NOT_COMPLIANT") return { state: "not_compliant", row };
  return { state: "not_screened", reason: "no_verdict" };
}

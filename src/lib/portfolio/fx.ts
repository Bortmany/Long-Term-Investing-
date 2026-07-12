// Currency conversion from stored FxRate rows.
//
// GOLDEN RULE: when no rate is known for a currency pair the result is a
// typed "missing rate" — never a silent 1.0.

import type { Currency } from "@prisma/client";
import type { FxRateInput } from "./types";

export type ConversionOk = {
  ok: true;
  value: number;
  /** The rate applied (1 `from` = rate `to`). 1 when from === to. */
  rate: number;
  /** As-of date of the rate used; null for same-currency conversions. */
  rateAsOf: Date | null;
};

export type ConversionMissing = {
  ok: false;
  missingRate: { from: Currency; to: Currency };
};

export type ConversionResult = ConversionOk | ConversionMissing;

/**
 * Find the most recent applicable rate for from→to among `rates`.
 * Uses a direct rate (base=from, quote=to) or the inverse of the reverse
 * pair. Returns null when neither exists.
 */
export function findRate(
  from: Currency,
  to: Currency,
  rates: FxRateInput[],
): { rate: number; asOf: Date } | null {
  let best: { rate: number; asOf: Date } | null = null;
  for (const row of rates) {
    let rate: number | null = null;
    if (row.base === from && row.quote === to) {
      rate = row.rate;
    } else if (row.base === to && row.quote === from && row.rate !== 0) {
      rate = 1 / row.rate;
    }
    if (rate !== null && (best === null || row.asOf > best.asOf)) {
      best = { rate, asOf: row.asOf };
    }
  }
  return best;
}

export function convertAmount(
  amount: number,
  from: Currency,
  to: Currency,
  rates: FxRateInput[],
): ConversionResult {
  if (from === to) {
    return { ok: true, value: amount, rate: 1, rateAsOf: null };
  }
  const found = findRate(from, to, rates);
  if (!found) {
    return { ok: false, missingRate: { from, to } };
  }
  return {
    ok: true,
    value: amount * found.rate,
    rate: found.rate,
    rateAsOf: found.asOf,
  };
}

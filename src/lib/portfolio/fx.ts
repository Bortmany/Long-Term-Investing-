// Currency conversion from stored FxRate rows.
//
// GOLDEN RULE: when no rate is known for a currency pair the result is a
// typed "missing rate" — never a silent 1.0.
//
// Three ways to find a rate, tried in this order:
//   1. direct   — a stored row for from→to
//   2. inverse  — a stored row for to→from (we divide 1 by it)
//   3. via OMR  — from→OMR and OMR→to, each found direct or inverse, and the
//                 two rates multiplied. The rial is the app's hub currency.
// Nothing here knows any exchange rate (no peg number): it only combines
// the stored rows it is given. A rate that is zero, negative or not a finite
// number is ignored, so it can never produce a result or a divide-by-zero.

import type { Currency } from "@prisma/client";
import type { FxRateInput } from "./types";

/** The hub currency a missing direct rate is worked out through. */
export const FX_HUB_CURRENCY: Currency = "OMR";

/** One step of a conversion: 1 `from` = `rate` `to`, as of `asOf`. */
export type FxLeg = {
  from: Currency;
  to: Currency;
  rate: number;
  asOf: Date;
};

/** Filled in when a rate was worked out through the rial (both legs shown). */
export type FxViaHub = {
  via: Currency;
  first: FxLeg;
  second: FxLeg;
};

export type ConversionOk = {
  ok: true;
  value: number;
  /** The rate applied (1 `from` = rate `to`). 1 when from === to. */
  rate: number;
  /**
   * As-of date of the rate used; null for same-currency conversions. When the
   * rate went through the rial this is the OLDER of the two legs' dates.
   */
  rateAsOf: Date | null;
  /** Present only when the rate was worked out through the rial. */
  viaHub?: FxViaHub;
};

export type ConversionMissing = {
  ok: false;
  missingRate: { from: Currency; to: Currency };
};

export type ConversionResult = ConversionOk | ConversionMissing;

/** A usable stored rate: a finite number above zero. */
function isUsableRate(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0;
}

/**
 * Find the most recent applicable rate for from→to among `rates`, using a
 * direct row or the inverse of the reverse row. Unusable rows (zero,
 * negative, not a number) are skipped. Returns null when nothing is usable.
 */
export function findRate(
  from: Currency,
  to: Currency,
  rates: FxRateInput[],
): { rate: number; asOf: Date } | null {
  let best: { rate: number; asOf: Date } | null = null;
  for (const row of rates) {
    if (!isUsableRate(row.rate)) continue;
    let rate: number | null = null;
    if (row.base === from && row.quote === to) {
      rate = row.rate;
    } else if (row.base === to && row.quote === from) {
      rate = 1 / row.rate;
    }
    if (rate !== null && (best === null || row.asOf > best.asOf)) {
      best = { rate, asOf: row.asOf };
    }
  }
  return best;
}

export type FoundRate = {
  rate: number;
  /** For a rate through the rial: the OLDER leg's date. */
  asOf: Date;
  viaHub?: FxViaHub;
};

/**
 * Like findRate, but if neither a direct nor an inverse row exists it tries
 * the route through the rial. A direct/inverse rate always wins over the
 * derived one. Returns null when no route exists.
 */
export function findRateWithHub(
  from: Currency,
  to: Currency,
  rates: FxRateInput[],
): FoundRate | null {
  const direct = findRate(from, to, rates);
  if (direct) return direct;

  // Going through the rial only makes sense for two non-rial currencies.
  if (from === FX_HUB_CURRENCY || to === FX_HUB_CURRENCY) return null;

  const first = findRate(from, FX_HUB_CURRENCY, rates);
  const second = findRate(FX_HUB_CURRENCY, to, rates);
  if (!first || !second) return null;

  const rate = first.rate * second.rate;
  if (!isUsableRate(rate)) return null;

  return {
    rate,
    asOf: first.asOf <= second.asOf ? first.asOf : second.asOf,
    viaHub: {
      via: FX_HUB_CURRENCY,
      first: { from, to: FX_HUB_CURRENCY, rate: first.rate, asOf: first.asOf },
      second: { from: FX_HUB_CURRENCY, to, rate: second.rate, asOf: second.asOf },
    },
  };
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
  const found = findRateWithHub(from, to, rates);
  if (!found) {
    return { ok: false, missingRate: { from, to } };
  }
  const result: ConversionOk = {
    ok: true,
    value: amount * found.rate,
    rate: found.rate,
    rateAsOf: found.asOf,
  };
  if (found.viaHub) result.viaHub = found.viaHub;
  return result;
}

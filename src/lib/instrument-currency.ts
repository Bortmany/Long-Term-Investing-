// A buy or sell is priced in the stock's own currency. The server compares the
// currency on the form with the one stored for that stock and refuses a
// mismatch, so a trade can never be saved under the wrong currency code.

import type { Currency } from "@prisma/client";

/** Plain-English refusal, or null when the currency is fine (or doesn't apply). */
export function currencyMismatchMessage(
  input: { type: string; currency: Currency },
  instrument: { ticker: string; currency: Currency },
): string | null {
  if (input.type !== "BUY" && input.type !== "SELL") return null;
  if (input.currency === instrument.currency) return null;
  return (
    `${instrument.ticker} trades in ${instrument.currency}, but this trade says ${input.currency}. ` +
    `Change the currency to ${instrument.currency} and enter the price in ${instrument.currency}.`
  );
}

/**
 * The red form error to show under the form. When the server refused with the
 * very same currency-mismatch sentence the amber hint already shows, say it
 * once (the hint) and hide the red copy.
 */
export function visibleFormError(
  formError: string | null,
  currencyHint: string | null,
): string | null {
  if (!formError) return null;
  if (currencyHint && formError.trim() === currencyHint.trim()) return null;
  return formError;
}

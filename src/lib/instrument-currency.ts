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

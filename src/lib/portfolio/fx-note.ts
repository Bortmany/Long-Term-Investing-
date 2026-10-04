// Plain-English note for a converted holding value whose exchange rate was
// worked out through the rial (OMR). Shows the OLDER of the two rate dates,
// which is the honest "as of" for the combined rate. Pure; no I/O.

import { formatShortDate } from "@/lib/format";
import type { FxViaHub } from "./fx";

export function fxViaHubNote(valuation: {
  fxViaHub?: FxViaHub;
  fxRateAsOf: Date | null;
}): string | null {
  if (!valuation.fxViaHub || !valuation.fxRateAsOf) return null;
  return `rate via ${valuation.fxViaHub.via}, as of ${formatShortDate(valuation.fxRateAsOf)}`;
}

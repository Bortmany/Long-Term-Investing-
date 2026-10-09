// Plain wording for the "From broker" tag. Pure (no database), so the client
// components can import it safely.

import { formatShortDate } from "@/lib/format";

/** The one explanation sentence for a "From broker" tag (UI spec section 12). */
export function fromBrokerExplanation(syncedOn: Date | null, connected: boolean): string {
  if (!connected) {
    return "Brought in by your Interactive Brokers sync. You've disconnected since, so deleting this trade won't bring it back.";
  }
  if (syncedOn) {
    return `Brought in by your Interactive Brokers sync on ${formatShortDate(syncedOn)}. If you delete this trade, the next sync adds it back.`;
  }
  return "Brought in by your Interactive Brokers sync. If you delete this trade, the next sync adds it back.";
}

/** The extra sentence in the delete dialog; null when disconnected (no extra line). */
export function fromBrokerDeleteLine(connected: boolean): string | null {
  return connected ? "This trade came from your broker sync. The next sync will add it back." : null;
}

// Which state the Settings "Broker connection" card shows. The order of
// checks never changes (dormant first, so an unavailable feature never nudges
// anyone to upgrade). Reads only the safe view: no token field exists in it.

import { isBillingEnabled } from "@/lib/billing/config";
import { isPro } from "@/lib/plan-access";
import { isBrokerConnectionEnabled } from "./config";
import { getConnectionView, maybeCreateExpiryReminder } from "./store";
import type { BrokerCardState } from "./types";

export async function loadBrokerCardState(userId: string): Promise<BrokerCardState> {
  const connection = await getConnectionView(userId);

  if (!isBrokerConnectionEnabled()) return { kind: "dormant", connection };

  if (!(await isPro(userId))) {
    return { kind: "free", connection, billingEnabled: isBillingEnabled() };
  }

  if (!connection) return { kind: "not_connected" };

  // The "token expires soon" notice fires from here, the next time the user
  // opens a page that shows the card (there is no background job).
  await maybeCreateExpiryReminder(userId);
  return { kind: "connection", connection };
}

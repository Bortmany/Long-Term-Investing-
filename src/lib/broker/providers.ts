// The registry of broker providers. Today: Interactive Brokers Flex only.
// Actions look a provider up by id; an unknown id is refused. Nothing
// SnapTrade-specific is built or stubbed here.

import type { BrokerProvider, BrokerProviderId } from "./types";
import { getStatement, sendRequest, type FlexDeps } from "./ibkr-flex/client";

export const IBKR_FLEX_PROVIDER_ID: BrokerProviderId = "ibkr_flex";

export function createIbkrFlexProvider(deps: FlexDeps = {}): BrokerProvider {
  return {
    id: "ibkr_flex",
    displayName: "Interactive Brokers",
    checkCredentials: (creds) => sendRequest(creds, deps),
    fetchActivity: (creds, referenceCode) => getStatement(creds, referenceCode, deps),
  };
}

const PROVIDERS: Record<string, BrokerProvider> = {
  ibkr_flex: createIbkrFlexProvider(),
};

/** Look a provider up by id. Null for anything not registered. */
export function getBrokerProvider(id: string): BrokerProvider | null {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, id) ? PROVIDERS[id] : null;
}

export function isBrokerProviderId(id: string): id is BrokerProviderId {
  return getBrokerProvider(id) !== null;
}

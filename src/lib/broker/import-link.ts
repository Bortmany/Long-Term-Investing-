// Should the import page's IBKR screen offer "Connect instead"? (UI spec
// section 13.) Decided on the server, from the user's own state only.
//   - null: no link. Dormant (no dead end), or the user already has a connection.
//   - "pro": switched on, user is on Free, so the link says "(Pro)".
//   - "available": switched on, user is Pro and not connected, so no "(Pro)".

import { isPro } from "@/lib/plan-access";
import { isBrokerConnectionEnabled } from "./config";
import { hasConnection } from "./store";

export type ImportBrokerLink = "pro" | "available" | null;

export function decideImportBrokerLink(state: {
  enabled: boolean;
  pro: boolean;
  connected: boolean;
}): ImportBrokerLink {
  if (!state.enabled || state.connected) return null;
  return state.pro ? "available" : "pro";
}

export async function loadImportBrokerLink(userId: string): Promise<ImportBrokerLink> {
  if (!isBrokerConnectionEnabled()) return null;
  const [pro, connected] = await Promise.all([isPro(userId), hasConnection(userId)]);
  return decideImportBrokerLink({ enabled: true, pro, connected });
}

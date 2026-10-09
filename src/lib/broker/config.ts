// Is the broker connection switched on for this server? Only when a valid
// encryption key is set. Unset: dormant, silently. Set but malformed:
// dormant AND one logged error (never the key itself).

import { logger } from "@/lib/logger";
import { getKeyStatus, type KeyStatus } from "./crypto";

let warnedInvalid = false;

export function getBrokerKeyState(): KeyStatus {
  const status = getKeyStatus();
  if (status === "invalid_key" && !warnedInvalid) {
    warnedInvalid = true;
    logger.error("Broker connection is off: the encryption key is set but is not a valid 32-byte key.");
  }
  return status;
}

export function isBrokerConnectionEnabled(): boolean {
  return getBrokerKeyState() === "enabled";
}

/** The sentence the card and the actions show while dormant. */
export const BROKER_DORMANT_MESSAGE =
  "Broker connection isn't switched on for this server yet. The site owner needs to finish setting it up. Until then, import your trades from a file instead.";

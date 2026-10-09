"use server";

// Read-only broker connection (Interactive Brokers Flex): connect, sync now,
// disconnect. The user id comes from the SESSION only. The provider is fixed
// by the server. The token is checked, encrypted and stored; it is never
// returned, logged, or put in an error message.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getSessionUserId } from "@/lib/user-portfolio";
import { requirePro } from "@/lib/plan-access";
import {
  BROKER_CONNECT_RATE_LIMIT,
  BROKER_SYNC_RATE_LIMIT,
  WRITE_ACTION_RATE_LIMIT,
  rateLimit,
  rateLimitMessage,
  userKey,
} from "@/lib/rate-limit";
import { BROKER_DORMANT_MESSAGE, isBrokerConnectionEnabled } from "@/lib/broker/config";
import { encryptToken } from "@/lib/broker/crypto";
import { getBrokerProvider } from "@/lib/broker/providers";
import { deleteConnection, saveConnection } from "@/lib/broker/store";
import { runSyncForUser } from "@/lib/broker/sync-default";
import type { BrokerProviderId, BrokerSyncSummary } from "@/lib/broker/types";

// The only provider today. Fixed here, never chosen by the client.
const PROVIDER: BrokerProviderId = "ibkr_flex";
const PRO_LABEL = "Broker connection";

const DAY_MS = 24 * 60 * 60 * 1000;

const connectSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{10,100}$/, "That doesn't look like an IBKR Flex token."),
  queryId: z
    .string()
    .trim()
    .regex(/^\d{1,12}$/, "The Query ID is a number, for example 123456."),
  expiresOn: z.string().trim().optional(),
});

function refreshPages() {
  revalidatePath("/settings");
  revalidatePath("/portfolio");
  revalidatePath("/dashboard");
}

/** Parse the optional expiry date: a future date within 13 months, or null. */
function parseExpiry(text: string | undefined, now: Date): { ok: true; date: Date | null } | { ok: false } {
  if (!text) return { ok: true, date: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { ok: false };
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return { ok: false };
  if (date.getTime() <= now.getTime() || date.getTime() > now.getTime() + 396 * DAY_MS) {
    return { ok: false };
  }
  return { ok: true, date };
}

function refusalSummary(message: string): BrokerSyncSummary {
  return { status: "FAILED", rowsAdded: 0, rowsAlready: 0, rowsSkipped: 0, message };
}

/**
 * Connect (or reconnect) Interactive Brokers: check the token with IBKR, save
 * it encrypted only if IBKR accepts it, then run the first sync.
 */
export async function connectBroker(input: {
  token: string;
  queryId: string;
  expiresOn?: string;
}): Promise<ActionResult<BrokerSyncSummary>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  // Dormant first, so an unavailable feature never pushes anyone to upgrade.
  if (!isBrokerConnectionEnabled()) return actionError(BROKER_DORMANT_MESSAGE);

  const pro = await requirePro(userId, PRO_LABEL);
  if (!pro.ok) return pro;

  const limited = rateLimit(userKey("broker-connect", userId), BROKER_CONNECT_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  // Fixed messages only: the input is never echoed back.
  const parsed = connectSchema.safeParse(input ?? {});
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return actionError(
      field === "queryId"
        ? "The Query ID is a number, for example 123456."
        : "That doesn't look like an IBKR Flex token.",
    );
  }
  const expiry = parseExpiry(parsed.data.expiresOn, new Date());
  if (!expiry.ok) return actionError("Pick a date in the future, within the next 13 months.");

  const provider = getBrokerProvider(PROVIDER);
  if (!provider) return actionError("That broker isn't available.");

  const creds = { token: parsed.data.token, queryId: parsed.data.queryId };
  const checked = await provider.checkCredentials(creds);
  if (!checked.ok) return actionError(`${checked.message} Nothing was saved.`);

  const encrypted = encryptToken(creds.token, userId, PROVIDER);
  if (!encrypted.ok) return actionError(BROKER_DORMANT_MESSAGE);

  await saveConnection(userId, PROVIDER, {
    encryptedToken: encrypted.value,
    queryId: creds.queryId,
    tokenExpiresOn: expiry.date,
  });

  const outcome = await runSyncForUser({
    userId,
    provider: PROVIDER,
    initialReferenceCode: checked.referenceCode,
  });
  refreshPages();
  if (outcome.status === "refused") return actionOk(refusalSummary(outcome.message));
  return actionOk(outcome.summary);
}

/** Sync now: fetch any new trades. Manual only; there is no scheduler. */
export async function syncBrokerNow(): Promise<ActionResult<BrokerSyncSummary>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  if (!isBrokerConnectionEnabled()) return actionError(BROKER_DORMANT_MESSAGE);

  const pro = await requirePro(userId, PRO_LABEL);
  if (!pro.ok) return pro;

  const limited = rateLimit(userKey("broker-sync", userId), BROKER_SYNC_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const outcome = await runSyncForUser({ userId, provider: PROVIDER });
  refreshPages();
  if (outcome.status === "refused") return actionError(outcome.message);
  return actionOk(outcome.summary);
}

/**
 * Disconnect: delete the saved connection, and the token with it. Not
 * Pro-gated and not blocked when dormant, so a person can always delete their
 * saved token. Transactions already imported stay and keep their tag.
 */
export async function disconnectBroker(): Promise<ActionResult<{ alreadyDisconnected: boolean }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("broker-disconnect", userId), WRITE_ACTION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const removed = await deleteConnection(userId, PROVIDER);
  refreshPages();
  return actionOk({ alreadyDisconnected: removed === 0 });
}

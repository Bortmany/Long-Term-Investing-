// Database access for the broker connection.
//
// EVERY function takes the user id from the session (never client input) and
// puts it in the query's filter, so one user can never read or change another
// user's connection, runs or token. Every read uses an explicit field list
// that leaves the token out, EXCEPT getConnectionForSync, which is used only
// by the sync service.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SyncConnection, SyncStore, RunResult } from "./sync";
import { ABANDONED_CLAIM_MS, KEEP_RUNS } from "./sync";
import type {
  BrokerConnectionView,
  BrokerProviderId,
  BrokerRunView,
  SkipReason,
} from "./types";

const PROVIDER_NAMES: Record<string, string> = { ibkr_flex: "Interactive Brokers" };

const RUN_SELECT = {
  id: true,
  startedAt: true,
  finishedAt: true,
  status: true,
  rowsSeen: true,
  rowsAdded: true,
  rowsAlready: true,
  rowsSkipped: true,
  rowsRejected: true,
  accountCount: true,
  skipReasons: true,
  message: true,
} satisfies Prisma.BrokerSyncRunSelect;

// NOTE: no encryptedToken here, on purpose.
const VIEW_SELECT = {
  provider: true,
  queryId: true,
  accountId: true,
  status: true,
  tokenExpiresOn: true,
  createdAt: true,
  lastAttemptAt: true,
  lastSuccessAt: true,
  lastFailureCode: true,
  lastFailureMessage: true,
  syncingSince: true,
  runs: { orderBy: { startedAt: "desc" as const }, take: 1, select: RUN_SELECT },
} satisfies Prisma.BrokerConnectionSelect;

function toSkipReasons(value: Prisma.JsonValue | null): SkipReason[] {
  if (!Array.isArray(value)) return [];
  const out: SkipReason[] = [];
  for (const item of value) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const reason = item.reason;
      const count = item.count;
      if (typeof reason === "string" && typeof count === "number") out.push({ reason, count });
    }
  }
  return out;
}

function toRunView(run: Prisma.BrokerSyncRunGetPayload<{ select: typeof RUN_SELECT }>): BrokerRunView {
  return {
    id: run.id,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    status: run.status,
    rowsSeen: run.rowsSeen,
    rowsAdded: run.rowsAdded,
    rowsAlready: run.rowsAlready,
    rowsSkipped: run.rowsSkipped,
    rowsRejected: run.rowsRejected,
    accountCount: run.accountCount,
    skipReasons: toSkipReasons(run.skipReasons),
    message: run.message,
  };
}

/** A claim younger than this still counts as a sync in progress. */
function isClaimLive(since: Date | null, now: Date): boolean {
  return since !== null && now.getTime() - since.getTime() < ABANDONED_CLAIM_MS;
}

/** The safe view of the user's connection (no token field of any kind). */
export async function getConnectionView(
  userId: string,
  provider: BrokerProviderId = "ibkr_flex",
  now: Date = new Date(),
): Promise<BrokerConnectionView | null> {
  const row = await prisma.brokerConnection.findFirst({
    where: { userId, provider },
    select: VIEW_SELECT,
  });
  if (!row) return null;
  return {
    provider,
    providerName: PROVIDER_NAMES[row.provider] ?? "Broker",
    queryId: row.queryId,
    accountEnding: row.accountId ? row.accountId.slice(-4) : null,
    status: row.status,
    expiryDateEntered: row.tokenExpiresOn ? row.tokenExpiresOn.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    lastAttemptAt: row.lastAttemptAt ? row.lastAttemptAt.toISOString() : null,
    lastSuccessAt: row.lastSuccessAt ? row.lastSuccessAt.toISOString() : null,
    lastFailureCode: row.lastFailureCode,
    lastFailureMessage: row.lastFailureMessage,
    syncing: isClaimLive(row.syncingSince, now),
    lastRun: row.runs[0] ? toRunView(row.runs[0]) : null,
  };
}

/** Does this user have any saved connection? (Used for tags and notices.) */
export async function hasConnection(userId: string): Promise<boolean> {
  const count = await prisma.brokerConnection.count({ where: { userId } });
  return count > 0;
}

/**
 * Save (or replace) the user's connection with an ALREADY-ENCRYPTED token.
 * Reconnecting is the same call: it resets the state to ACTIVE and clears the
 * old failure, cooldown and reminder marks.
 */
export async function saveConnection(
  userId: string,
  provider: BrokerProviderId,
  data: { encryptedToken: string; queryId: string; tokenExpiresOn: Date | null },
): Promise<void> {
  await prisma.brokerConnection.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, ...data },
    update: {
      ...data,
      status: "ACTIVE",
      lastAttemptAt: null,
      lastFailureCode: null,
      lastFailureMessage: null,
      expiryReminderSentAt: null,
    },
    select: { id: true },
  });
}

/** Delete the user's connection (and with it the token). Returns rows deleted. */
export async function deleteConnection(
  userId: string,
  provider: BrokerProviderId = "ibkr_flex",
): Promise<number> {
  const result = await prisma.brokerConnection.deleteMany({ where: { userId, provider } });
  return result.count;
}

/** The Query ID of the user's saved connection (for the Reconnect form). */
export async function getSavedQueryId(
  userId: string,
  provider: BrokerProviderId = "ibkr_flex",
): Promise<string | null> {
  const row = await prisma.brokerConnection.findFirst({
    where: { userId, provider },
    select: { queryId: true },
  });
  return row?.queryId ?? null;
}

/** Import references already stored in the user's portfolio. */
export async function loadKnownReferences(userId: string): Promise<string[]> {
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!portfolio) return [];
  const rows = await prisma.transaction.findMany({
    where: { portfolioId: portfolio.id, importReference: { not: null } },
    select: { importReference: true },
  });
  return rows.flatMap((r) => (r.importReference ? [r.importReference] : []));
}

/** The sync service's database side. All queries are filtered by userId. */
export const prismaSyncStore: SyncStore = {
  async getConnection(userId, provider): Promise<SyncConnection | null> {
    // The ONLY read that includes the encrypted token: used by the sync service.
    return prisma.brokerConnection.findFirst({
      where: { userId, provider },
      select: { id: true, queryId: true, encryptedToken: true, status: true, lastAttemptAt: true },
    });
  },

  async claim(userId, connectionId, now) {
    const stale = new Date(now.getTime() - ABANDONED_CLAIM_MS);
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.brokerConnection.updateMany({
        where: {
          id: connectionId,
          userId,
          OR: [{ syncingSince: null }, { syncingSince: { lt: stale } }],
        },
        data: { syncingSince: now },
      });
      if (claimed.count !== 1) return false;
      // A takeover closes the abandoned run(s) as interrupted.
      await tx.brokerSyncRun.updateMany({
        where: { connectionId, userId, status: "RUNNING" },
        data: { status: "FAILED", finishedAt: now, message: "Interrupted." },
      });
      return true;
    });
  },

  async release(userId, connectionId) {
    await prisma.brokerConnection.updateMany({
      where: { id: connectionId, userId },
      data: { syncingSince: null },
    });
  },

  async createRun(userId, connectionId, now) {
    const run = await prisma.brokerSyncRun.create({
      data: { userId, connectionId, startedAt: now, trigger: "manual", status: "RUNNING" },
      select: { id: true },
    });
    return run.id;
  },

  async finishRun(userId, connectionId, runId, result: RunResult, now) {
    await prisma.$transaction(async (tx) => {
      await tx.brokerSyncRun.updateMany({
        where: { id: runId, userId },
        data: {
          finishedAt: now,
          status: result.status,
          rowsSeen: result.rowsSeen,
          rowsAdded: result.rowsAdded,
          rowsAlready: result.rowsAlready,
          rowsSkipped: result.rowsSkipped,
          rowsRejected: result.rowsRejected,
          accountCount: result.accountCount,
          skipReasons: result.skipReasons,
          message: result.message,
        },
      });

      const succeeded = result.status === "SUCCEEDED";
      await tx.brokerConnection.updateMany({
        where: { id: connectionId, userId },
        data: {
          lastAttemptAt: now,
          ...(succeeded
            ? {
                lastSuccessAt: now,
                lastFailureCode: null,
                lastFailureMessage: null,
                ...(result.accountId ? { accountId: result.accountId } : {}),
              }
            : { lastFailureCode: result.failureCode, lastFailureMessage: result.message }),
        },
      });

      // The "needs reconnect" flip and its notification share this step, and
      // the flip only matches an ACTIVE row, so one transition = one notice.
      if (result.status === "NEEDS_RECONNECT") {
        const flipped = await tx.brokerConnection.updateMany({
          where: { id: connectionId, userId, status: "ACTIVE" },
          data: { status: "NEEDS_RECONNECT" },
        });
        if (flipped.count === 1) {
          await tx.notification.create({
            data: {
              userId,
              title: "Reconnect Interactive Brokers",
              body: "Your IBKR token no longer works, so new trades aren't syncing. Open Settings to reconnect.",
            },
          });
        }
      }

      // Keep only the newest runs for this connection.
      const old = await tx.brokerSyncRun.findMany({
        where: { connectionId, userId },
        orderBy: { startedAt: "desc" },
        skip: KEEP_RUNS,
        select: { id: true },
      });
      if (old.length > 0) {
        await tx.brokerSyncRun.deleteMany({
          where: { userId, id: { in: old.map((r) => r.id) } },
        });
      }
    });
  },
};

/**
 * The one-time "your token expires soon" notice, 7 days before the date the
 * user typed. Runs when the user opens a page that loads the card (there is
 * no scheduler in this step). The claim is a single guarded update, so it
 * fires once.
 */
export async function maybeCreateExpiryReminder(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    const row = await tx.brokerConnection.findFirst({
      where: {
        userId,
        expiryReminderSentAt: null,
        tokenExpiresOn: { gt: now, lte: soon },
      },
      select: { id: true, tokenExpiresOn: true },
    });
    if (!row || !row.tokenExpiresOn) return false;
    const claimed = await tx.brokerConnection.updateMany({
      where: { id: row.id, userId, expiryReminderSentAt: null },
      data: { expiryReminderSentAt: now },
    });
    if (claimed.count !== 1) return false;
    const date = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(row.tokenExpiresOn);
    await tx.notification.create({
      data: {
        userId,
        title: "Your IBKR token expires soon",
        body: `The date you entered is ${date}. Create a new token in IBKR and reconnect.`,
      },
    });
    return true;
  });
}

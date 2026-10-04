// What the Portfolio page needs to mark trades "From broker" and to warn when
// the connection needs reconnecting. Every query is filtered by the signed-in
// user's id (runs are reached through their own connection). No token field
// is ever read here.

import { prisma } from "@/lib/prisma";

export type BrokerPortfolioInfo = {
  /** The user has a saved connection (decides which tag/delete sentence shows). */
  connected: boolean;
  /** IBKR refused the saved token, so new trades are not syncing. */
  needsReconnect: boolean;
  /** When each sync run started, keyed by run id (missing once old history is pruned). */
  runDates: Map<string, Date>;
};

export async function loadBrokerPortfolioInfo(
  userId: string,
  runIds: string[],
): Promise<BrokerPortfolioInfo> {
  const [connection, runs] = await Promise.all([
    prisma.brokerConnection.findFirst({ where: { userId }, select: { status: true } }),
    runIds.length > 0
      ? prisma.brokerSyncRun.findMany({
          where: { id: { in: runIds }, connection: { userId } },
          select: { id: true, startedAt: true },
        })
      : Promise.resolve([]),
  ]);
  return {
    connected: connection !== null,
    needsReconnect: connection?.status === "NEEDS_RECONNECT",
    runDates: new Map(runs.map((r) => [r.id, r.startedAt])),
  };
}

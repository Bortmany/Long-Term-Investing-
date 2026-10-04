// The real wiring for the sync service: the database store, the broker
// provider from the registry, the encryption module and the shared commit
// path. Tests build their own SyncDeps instead.

import { prisma } from "@/lib/prisma";
import { commitImportRows } from "@/lib/import-commit";
import { decryptToken } from "./crypto";
import { getBrokerProvider } from "./providers";
import { loadKnownReferences, prismaSyncStore } from "./store";
import { runSync, type SyncDeps, type SyncOutcome } from "./sync";
import type { BrokerProviderId } from "./types";

export async function runSyncForUser(input: {
  userId: string;
  provider: BrokerProviderId;
  initialReferenceCode?: string;
}): Promise<SyncOutcome> {
  const provider = getBrokerProvider(input.provider);
  if (!provider) {
    return { status: "refused", code: "no_connection", message: "Connect Interactive Brokers first." };
  }
  const deps: SyncDeps = {
    store: prismaSyncStore,
    provider,
    decrypt: (stored, userId, id) => {
      const result = decryptToken(stored, userId, id);
      return result.ok ? result.token : null;
    },
    loadInstruments: () =>
      prisma.instrument.findMany({ select: { ticker: true, market: true } }),
    loadKnownReferences,
    commit: commitImportRows,
  };
  return runSync(input, deps);
}

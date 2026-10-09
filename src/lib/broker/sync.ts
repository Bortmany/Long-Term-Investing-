// The sync service, shared by "Connect" (first sync) and "Sync now".
//
// Every outside thing it needs (the database, the broker, the shared commit
// path, the clock) is passed in as `SyncDeps`, so the steps are unit-tested
// without a database or a network. The real wiring is in sync-default.ts.
//
// Rules this file enforces (spec 4.4):
//  - one sync per connection at a time (claim lives in the database);
//  - 60-second cooldown after a finished sync;
//  - all-or-nothing: a run adds every new row or none;
//  - trades only (buys and sells): the Step 4a preset decides each row;
//  - an untracked ticker is never created: the run fails and says which;
//  - the claim is released in `finally`, so a crash never leaves it stuck.
//
// Logs carry counts and codes only: never the token, a web address or any
// broker text.

import { logger } from "@/lib/logger";
import { formatShortDate } from "@/lib/format";
import { prepareUpload } from "@/lib/import-presets";
import type { ReadOk, TrackedInstrument } from "@/lib/import-presets/types";
import type { MappedImportRow } from "@/lib/import-rows";
import type { CommitOutcome, ImportStamp } from "@/lib/import-commit";
import { adaptFlexReport } from "./ibkr-flex/adapter";
import { KEY_UNREADABLE_MESSAGE } from "./ibkr-flex/errors";
import type {
  BrokerFailure,
  BrokerProvider,
  BrokerProviderId,
  BrokerSyncSummary,
  SkipReason,
} from "./types";

export const COOLDOWN_MS = 60_000;
export const ABANDONED_CLAIM_MS = 5 * 60_000;
export const MAX_SYNCS_IN_FLIGHT = 5;
export const KEEP_RUNS = 30;
const MAX_MESSAGE = 500;

export type SyncConnection = {
  id: string;
  queryId: string;
  encryptedToken: string;
  status: "ACTIVE" | "NEEDS_RECONNECT";
  lastAttemptAt: Date | null;
};

export type RunResult = {
  status: "SUCCEEDED" | "FAILED" | "NEEDS_RECONNECT";
  rowsSeen: number;
  rowsAdded: number;
  rowsAlready: number;
  rowsSkipped: number;
  rowsRejected: number;
  accountCount: number;
  skipReasons: SkipReason[];
  message: string;
  /** Our short code for a failure (null on success). */
  failureCode: string | null;
  /** First account id seen in the report (stored in full, shown as last four). */
  accountId: string | null;
};

export type SyncStore = {
  getConnection(userId: string, provider: BrokerProviderId): Promise<SyncConnection | null>;
  /** Atomically claim; an abandoned claim (older than 5 min) is taken over. */
  claim(userId: string, connectionId: string, now: Date): Promise<boolean>;
  release(userId: string, connectionId: string): Promise<void>;
  createRun(userId: string, connectionId: string, now: Date): Promise<string>;
  /** Close the run, update the connection, create the one-time reconnect notice, prune. */
  finishRun(
    userId: string,
    connectionId: string,
    runId: string,
    result: RunResult,
    now: Date,
  ): Promise<void>;
};

export type SyncDeps = {
  store: SyncStore;
  provider: BrokerProvider;
  decrypt(stored: string, userId: string, provider: BrokerProviderId): string | null;
  loadInstruments(): Promise<TrackedInstrument[]>;
  loadKnownReferences(userId: string): Promise<string[]>;
  commit(userId: string, rows: MappedImportRow[], stamp: ImportStamp): Promise<CommitOutcome>;
  now?: () => Date;
};

export type SyncRefusal = {
  status: "refused";
  code: "no_connection" | "needs_reconnect" | "cooldown" | "busy" | "server_busy";
  message: string;
};

export type SyncOutcome = { status: "done"; runId: string; summary: BrokerSyncSummary } | SyncRefusal;

let inFlight = 0;

/** Test helper: how many syncs this process is running right now. */
export function _inFlightCount(): number {
  return inFlight;
}

function fail(code: string, message: string, extra: Partial<RunResult> = {}): RunResult {
  return {
    status: "FAILED",
    rowsSeen: 0,
    rowsAdded: 0,
    rowsAlready: 0,
    rowsSkipped: 0,
    rowsRejected: 0,
    accountCount: 0,
    skipReasons: [],
    message: message.slice(0, MAX_MESSAGE),
    failureCode: code,
    accountId: null,
    ...extra,
  };
}

function fromFailure(f: BrokerFailure): RunResult {
  const base = fail(f.code, f.message);
  return f.kind === "reconnect" ? { ...base, status: "NEEDS_RECONNECT" } : base;
}

function groupReasons(reasons: string[]): SkipReason[] {
  const counts = new Map<string, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason: reason.slice(0, 200), count }));
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function successMessage(r: RunResult): string {
  const parts = [`${plural(r.rowsAdded, "trade", "trades")} added`];
  if (r.rowsAlready > 0) parts.push(`${r.rowsAlready} already in your portfolio`);
  if (r.rowsSkipped > 0) {
    const why = r.skipReasons.map((s) => `${s.reason} (${s.count})`).join("; ");
    parts.push(`${r.rowsSkipped} skipped${why ? `: ${why}` : ""}`);
  }
  return parts.join(", ").slice(0, MAX_MESSAGE);
}

function toLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toMapped(rows: { reference: string; line: number; mapped: Record<string, string | undefined> }[]): MappedImportRow[] {
  return rows.map((r) => ({ ...r.mapped, reference: r.reference, line: r.line }));
}

/** The pure middle of a sync: report text in, a run result out. */
async function processReport(
  userId: string,
  runId: string,
  provider: BrokerProviderId,
  body: string,
  deps: SyncDeps,
): Promise<RunResult> {
  const adapted = adaptFlexReport(body);
  if (!adapted.ok) return fail("report_unusable", adapted.message);

  const accountId = adapted.accountIds[0] ?? null;
  const accountCount = adapted.accountIds.length;
  if (!adapted.read) {
    const empty: RunResult = {
      ...fail("", ""),
      status: "SUCCEEDED",
      failureCode: null,
      accountCount,
      accountId,
      message: "",
    };
    empty.message = "No trades in this report.";
    return empty;
  }

  const [instruments, knownReferences] = await Promise.all([
    deps.loadInstruments(),
    deps.loadKnownReferences(userId),
  ]);
  const plan = prepareUpload([adapted.read as ReadOk], { instruments, knownReferences });

  if (plan.untrackedTickers.length > 0) {
    return fail(
      "untracked_tickers",
      `Track these first: ${plan.untrackedTickers.join(", ")}. Add them on the Stocks page, then sync again. Nothing was added.`,
      { rowsSeen: adapted.tradeCount, rowsRejected: plan.needsFixing.length, accountCount, accountId },
    );
  }
  if (plan.needsFixing.length > 0) {
    const first = plan.needsFixing[0];
    // Line 1 of the adapter's table is the header, so trade N is line N + 1.
    return fail(
      "unreadable_trade",
      `We couldn't read trade ${Math.max(1, first.line - 1)} in the report: ${first.reason} Nothing was added.`,
      { rowsSeen: adapted.tradeCount, rowsRejected: plan.needsFixing.length, accountCount, accountId },
    );
  }

  const skipReasons = groupReasons(plan.skipped.map((s) => s.reason));
  const rows = toMapped(plan.serverRows);
  const stamp: ImportStamp = { syncedFrom: provider, syncRunId: runId };
  const outcome = rows.length > 0 ? await deps.commit(userId, rows, stamp) : null;

  if (outcome && !outcome.ok) {
    if (outcome.kind === "oversell") {
      const bad = rows[outcome.row - 1];
      const when = bad?.tradeDate ? formatShortDate(toLocalDate(bad.tradeDate)) : "";
      const label = [bad?.ticker, when].filter(Boolean).join(", ");
      return fail(
        "needs_older_history",
        `We didn't add anything because one of your sells${label ? ` (${label})` : ""} is of shares bought before this report starts. InvestIQ never guesses missing shares. Import your older Interactive Brokers trades from a file first, then sync again.`,
        { rowsSeen: adapted.tradeCount, rowsRejected: 1, accountCount, accountId },
      );
    }
    return fail("rows_rejected", outcome.error, {
      rowsSeen: adapted.tradeCount,
      rowsRejected: 1,
      accountCount,
      accountId,
    });
  }

  const result: RunResult = {
    status: "SUCCEEDED",
    rowsSeen: adapted.tradeCount,
    rowsAdded: outcome?.ok ? outcome.imported : 0,
    rowsAlready: plan.alreadyImported.length + (outcome?.ok ? outcome.alreadyImportedCount : 0),
    rowsSkipped: plan.skipped.length,
    rowsRejected: 0,
    accountCount,
    skipReasons,
    message: "",
    failureCode: null,
    accountId,
  };
  result.message = successMessage(result);
  return result;
}

/**
 * Run one sync for `userId`. `initialReferenceCode` (from the connect step)
 * skips the first broker call. Never throws; never returns the token.
 */
export async function runSync(
  input: {
    userId: string;
    provider: BrokerProviderId;
    initialReferenceCode?: string;
    trigger?: "manual";
  },
  deps: SyncDeps,
): Promise<SyncOutcome> {
  const now = deps.now ?? (() => new Date());
  const { userId, provider } = input;
  const conn = await deps.store.getConnection(userId, provider);
  if (!conn) {
    return { status: "refused", code: "no_connection", message: "Connect Interactive Brokers first." };
  }
  if (conn.status === "NEEDS_RECONNECT") {
    return {
      status: "refused",
      code: "needs_reconnect",
      message: "Interactive Brokers needs reconnecting before it can sync.",
    };
  }
  if (conn.lastAttemptAt && now().getTime() - conn.lastAttemptAt.getTime() < COOLDOWN_MS) {
    return { status: "refused", code: "cooldown", message: "Synced moments ago." };
  }
  if (inFlight >= MAX_SYNCS_IN_FLIGHT) {
    return {
      status: "refused",
      code: "server_busy",
      message: "Sync is busy right now, try again in a minute.",
    };
  }
  if (!(await deps.store.claim(userId, conn.id, now()))) {
    return { status: "refused", code: "busy", message: "A sync is already running." };
  }

  inFlight += 1;
  let runId: string | null = null;
  let result: RunResult;
  try {
    runId = await deps.store.createRun(userId, conn.id, now());
    result = await runBody(userId, provider, conn, runId, input.initialReferenceCode, deps);
  } catch (error) {
    // Only the error's type name is logged: its message could carry data.
    logger.error("Broker sync failed unexpectedly", {
      userId,
      runId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    result = fail("internal", "Something went wrong during the sync. Nothing was added. Please try again.");
  }

  try {
    if (runId) await deps.store.finishRun(userId, conn.id, runId, result, now());
  } catch (error) {
    logger.error("Broker sync could not record its result", {
      userId,
      runId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
  } finally {
    inFlight -= 1;
    try {
      await deps.store.release(userId, conn.id);
    } catch {
      // The 5-minute takeover rule covers a claim that could not be released.
    }
  }

  logger.info("Broker sync finished", {
    userId,
    runId,
    status: result.status,
    code: result.failureCode,
    seen: result.rowsSeen,
    added: result.rowsAdded,
    already: result.rowsAlready,
    skipped: result.rowsSkipped,
  });

  return {
    status: "done",
    runId: runId ?? "",
    summary: {
      status: result.status,
      rowsAdded: result.rowsAdded,
      rowsAlready: result.rowsAlready,
      rowsSkipped: result.rowsSkipped,
      message: result.message,
    },
  };
}

async function runBody(
  userId: string,
  provider: BrokerProviderId,
  conn: SyncConnection,
  runId: string,
  initialReferenceCode: string | undefined,
  deps: SyncDeps,
): Promise<RunResult> {
  const token = deps.decrypt(conn.encryptedToken, userId, provider);
  if (token === null) {
    return { ...fail("key_unreadable", KEY_UNREADABLE_MESSAGE), status: "NEEDS_RECONNECT" };
  }
  const creds = { token, queryId: conn.queryId };

  let referenceCode = initialReferenceCode;
  if (!referenceCode) {
    const sent = await deps.provider.checkCredentials(creds);
    if (!sent.ok) return fromFailure(sent);
    referenceCode = sent.referenceCode;
  }
  const fetched = await deps.provider.fetchActivity(creds, referenceCode);
  if (!fetched.ok) return fromFailure(fetched);
  return processReport(userId, runId, provider, fetched.body, deps);
}

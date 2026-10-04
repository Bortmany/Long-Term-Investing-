import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ABANDONED_CLAIM_MS,
  COOLDOWN_MS,
  MAX_SYNCS_IN_FLIGHT,
  _inFlightCount,
  runSync,
  type RunResult,
  type SyncConnection,
  type SyncDeps,
  type SyncStore,
} from "@/lib/broker/sync";
import { decryptToken, encryptToken } from "@/lib/broker/crypto";
import { findImportOversell, validateMappedRows, type KnownInstrument, type MappedImportRow } from "@/lib/import-rows";
import type { CommitOutcome } from "@/lib/import-commit";
import type { BrokerProvider } from "@/lib/broker/types";
import {
  STATEMENT_SELL_ONLY,
  STATEMENT_TRADES,
  statementWith,
} from "../fixtures/ibkr-flex";

process.env.BROKER_TOKEN_KEY = Buffer.alloc(32, 3).toString("base64");

const KNOWN: KnownInstrument[] = [
  { id: "i-aapl", ticker: "AAPL", market: "US", currency: "USD" },
  { id: "i-msft", ticker: "MSFT", market: "US", currency: "USD" },
];
const TRACKED = KNOWN.map((i) => ({ ticker: i.ticker, market: i.market }));
const TOKEN = "TESTTOKEN-SYNC-SECRET-77";

// --- an in-memory stand-in for the database, keyed by the user id ----------

type Conn = SyncConnection & { userId: string; syncingSince: Date | null; accountId: string | null };
type Run = { id: string; userId: string; connectionId: string; status: string; result?: RunResult };

function makeWorld() {
  const conns: Conn[] = [];
  const runs: Run[] = [];
  const notifications: { userId: string; title: string }[] = [];
  const txns: { userId: string; reference: string; ticker: string; type: string; quantity: number; syncedFrom?: string; syncRunId?: string }[] = [];
  let counter = 0;

  const store: SyncStore = {
    async getConnection(userId) {
      return conns.find((c) => c.userId === userId) ?? null;
    },
    async claim(userId, id, now) {
      const c = conns.find((x) => x.id === id && x.userId === userId);
      if (!c) return false;
      if (c.syncingSince && now.getTime() - c.syncingSince.getTime() < ABANDONED_CLAIM_MS) return false;
      for (const r of runs) if (r.connectionId === id && r.userId === userId && r.status === "RUNNING") r.status = "INTERRUPTED";
      c.syncingSince = now;
      return true;
    },
    async release(userId, id) {
      const c = conns.find((x) => x.id === id && x.userId === userId);
      if (c) c.syncingSince = null;
    },
    async createRun(userId, connectionId) {
      const id = `run-${++counter}`;
      runs.push({ id, userId, connectionId, status: "RUNNING" });
      return id;
    },
    async finishRun(userId, connectionId, runId, result, now) {
      const run = runs.find((r) => r.id === runId && r.userId === userId)!;
      run.status = result.status;
      run.result = result;
      const c = conns.find((x) => x.id === connectionId && x.userId === userId)!;
      c.lastAttemptAt = now;
      if (result.status === "NEEDS_RECONNECT" && c.status === "ACTIVE") {
        c.status = "NEEDS_RECONNECT";
        notifications.push({ userId, title: "Reconnect Interactive Brokers" });
      }
      if (result.accountId) c.accountId = result.accountId;
    },
  };

  function addConnection(userId: string, token = TOKEN): Conn {
    const enc = encryptToken(token, userId, "ibkr_flex");
    if (!enc.ok) throw new Error("setup");
    const c: Conn = {
      id: `conn-${userId}`,
      userId,
      queryId: "123456",
      encryptedToken: enc.value,
      status: "ACTIVE",
      lastAttemptAt: null,
      syncingSince: null,
      accountId: null,
    };
    conns.push(c);
    return c;
  }

  /** Mirrors commitImportRows with the REAL validation and oversell guard. */
  async function commit(userId: string, rows: MappedImportRow[], stamp: { syncedFrom: string; syncRunId: string }): Promise<CommitOutcome> {
    const report = validateMappedRows(rows, KNOWN);
    const failed = report.results.filter((r) => !r.ok);
    if (failed.length > 0) {
      return { ok: false, kind: "validation", error: "Nothing was imported: a row has problems." };
    }
    const known = new Set(txns.filter((t) => t.userId === userId).map((t) => t.reference));
    const kept = report.results.flatMap((r) => (r.ok && !(r.reference && known.has(r.reference)) ? [r] : []));
    const starting = new Map<string, number>();
    for (const t of txns.filter((x) => x.userId === userId)) {
      const id = KNOWN.find((k) => k.ticker === t.ticker)!.id;
      starting.set(id, (starting.get(id) ?? 0) + (t.type === "BUY" ? t.quantity : -t.quantity));
    }
    const oversell = findImportOversell(kept, starting);
    if (oversell) return { ok: false, kind: "oversell", error: oversell.message, row: oversell.row };
    for (const r of kept) {
      if (!r.ok) continue;
      txns.push({
        userId,
        reference: r.reference ?? "",
        ticker: KNOWN.find((k) => k.id === (r.parsed as { instrumentId: string }).instrumentId)!.ticker,
        type: r.parsed.type,
        quantity: (r.parsed as { quantity: number }).quantity,
        syncedFrom: stamp.syncedFrom,
        syncRunId: stamp.syncRunId,
      });
    }
    return { ok: true, imported: kept.length, alreadyImportedCount: rows.length - kept.length };
  }

  return { conns, runs, notifications, txns, store, addConnection, commit };
}

function providerFor(body: string, calls?: { send: number; get: number }): BrokerProvider {
  return {
    id: "ibkr_flex",
    displayName: "Interactive Brokers",
    async checkCredentials() {
      if (calls) calls.send += 1;
      return { ok: true, referenceCode: "111" };
    },
    async fetchActivity() {
      if (calls) calls.get += 1;
      return { ok: true, body };
    },
  };
}

let world: ReturnType<typeof makeWorld>;
let clock: Date;
beforeEach(() => {
  world = makeWorld();
  clock = new Date("2026-10-04T12:00:00Z");
});

function depsFor(provider: BrokerProvider, overrides: Partial<SyncDeps> = {}): SyncDeps {
  return {
    store: world.store,
    provider,
    decrypt: (stored, userId, id) => {
      const r = decryptToken(stored, userId, id);
      return r.ok ? r.token : null;
    },
    loadInstruments: async () => TRACKED,
    loadKnownReferences: async (userId) => world.txns.filter((t) => t.userId === userId).map((t) => t.reference),
    commit: world.commit,
    now: () => clock,
    ...overrides,
  };
}

describe("sync service", () => {
  it("adds the 3 ready trades, skips 2, and stamps only synced rows", async () => {
    world.addConnection("A");
    const out = await runSync({ userId: "A", provider: "ibkr_flex" }, depsFor(providerFor(STATEMENT_TRADES)));
    expect(out.status).toBe("done");
    if (out.status !== "done") return;
    expect(out.summary).toMatchObject({ status: "SUCCEEDED", rowsAdded: 3, rowsAlready: 0, rowsSkipped: 2 });
    expect(out.summary.message).toContain("3 trades added");
    expect(out.summary.message).toContain("2 skipped");
    expect(world.txns).toHaveLength(3);
    expect(world.txns.every((t) => t.syncedFrom === "ibkr_flex" && t.syncRunId === out.runId)).toBe(true);
    expect(world.conns[0].accountId).toBe("U0000000");
  });

  it("a second sync of the same statement adds 0 and counts 3 already in the portfolio", async () => {
    world.addConnection("A");
    const d = depsFor(providerFor(STATEMENT_TRADES));
    await runSync({ userId: "A", provider: "ibkr_flex" }, d);
    clock = new Date(clock.getTime() + COOLDOWN_MS + 1000);
    const second = await runSync({ userId: "A", provider: "ibkr_flex" }, d);
    if (second.status !== "done") throw new Error("expected done");
    expect(second.summary).toMatchObject({ rowsAdded: 0, rowsAlready: 3 });
    expect(world.txns).toHaveLength(3);
  });

  it("a sell with no buy in range fails the whole sync and adds nothing", async () => {
    world.addConnection("A");
    const out = await runSync({ userId: "A", provider: "ibkr_flex" }, depsFor(providerFor(STATEMENT_SELL_ONLY)));
    if (out.status !== "done") throw new Error("expected done");
    expect(out.summary.status).toBe("FAILED");
    expect(out.summary.message).toContain("We didn't add anything because one of your sells (AAPL, Mar 2, 2026)");
    expect(out.summary.message).toContain("Import your older Interactive Brokers trades from a file first");
    expect(world.txns).toHaveLength(0);
  });

  it("an untracked ticker is never created: the run fails and names it", async () => {
    world.addConnection("A");
    const out = await runSync(
      { userId: "A", provider: "ibkr_flex" },
      depsFor(providerFor(STATEMENT_TRADES), { loadInstruments: async () => [TRACKED[0]] }),
    );
    if (out.status !== "done") throw new Error("expected done");
    expect(out.summary.status).toBe("FAILED");
    expect(out.summary.message).toContain("Track these first: MSFT");
    expect(world.txns).toHaveLength(0);
  });

  it("trades only: no dividend or cash rows ever come out of a sync", async () => {
    world.addConnection("A");
    await runSync({ userId: "A", provider: "ibkr_flex" }, depsFor(providerFor(STATEMENT_TRADES)));
    expect(world.txns.every((t) => t.type === "BUY" || t.type === "SELL")).toBe(true);
  });

  it("a bad value in a row fails the run with nothing added", async () => {
    world.addConnection("A");
    const bad = statementWith([
      '<Trade accountId="U0000000" currency="USD" assetCategory="STK" symbol="AAPL" tradeDate="20269999" buySell="BUY" quantity="10" tradePrice="205.40" transactionID="1" />',
    ]);
    const out = await runSync({ userId: "A", provider: "ibkr_flex" }, depsFor(providerFor(bad)));
    if (out.status !== "done") throw new Error("expected done");
    expect(out.summary.status).toBe("FAILED");
    expect(out.summary.message).toContain("trade 1");
    expect(world.txns).toHaveLength(0);
  });

  it("refuses when there is no connection, or it needs reconnecting", async () => {
    const none = await runSync({ userId: "A", provider: "ibkr_flex" }, depsFor(providerFor(STATEMENT_TRADES)));
    expect(none).toMatchObject({ status: "refused", code: "no_connection" });
    world.addConnection("A").status = "NEEDS_RECONNECT";
    const nr = await runSync({ userId: "A", provider: "ibkr_flex" }, depsFor(providerFor(STATEMENT_TRADES)));
    expect(nr).toMatchObject({ status: "refused", code: "needs_reconnect" });
  });

  it("60-second cooldown answers 'Synced moments ago' without calling IBKR", async () => {
    world.addConnection("A");
    const calls = { send: 0, get: 0 };
    const d = depsFor(providerFor(STATEMENT_TRADES, calls));
    await runSync({ userId: "A", provider: "ibkr_flex" }, d);
    expect(calls).toEqual({ send: 1, get: 1 });
    clock = new Date(clock.getTime() + 30_000);
    const again = await runSync({ userId: "A", provider: "ibkr_flex" }, d);
    expect(again).toMatchObject({ status: "refused", code: "cooldown", message: "Synced moments ago." });
    expect(calls).toEqual({ send: 1, get: 1 });
  });

  it("only one sync at a time; an abandoned claim older than 5 minutes is taken over", async () => {
    const conn = world.addConnection("A");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: BrokerProvider = {
      ...providerFor(STATEMENT_TRADES),
      async fetchActivity() {
        await gate;
        return { ok: true, body: STATEMENT_TRADES };
      },
    };
    const first = runSync({ userId: "A", provider: "ibkr_flex" }, depsFor(slow));
    await vi.waitFor(() => expect(conn.syncingSince).not.toBeNull());
    const second = await runSync({ userId: "A", provider: "ibkr_flex" }, depsFor(providerFor(STATEMENT_TRADES)));
    expect(second).toMatchObject({ status: "refused", code: "busy", message: "A sync is already running." });
    release();
    await first;
    expect(conn.syncingSince).toBeNull();

    // Abandoned claim: set one 6 minutes ago, with a stuck RUNNING run.
    conn.lastAttemptAt = null;
    conn.syncingSince = new Date(clock.getTime() - 6 * 60_000);
    world.runs.push({ id: "stuck", userId: "A", connectionId: conn.id, status: "RUNNING" });
    const taken = await runSync({ userId: "A", provider: "ibkr_flex" }, depsFor(providerFor(STATEMENT_TRADES)));
    expect(taken.status).toBe("done");
    expect(world.runs.find((r) => r.id === "stuck")!.status).toBe("INTERRUPTED");
  });

  it("releases the claim even when the code throws", async () => {
    const conn = world.addConnection("A");
    const boom: BrokerProvider = {
      ...providerFor(""),
      async fetchActivity() {
        throw new Error(`exploded with ${TOKEN}`);
      },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await runSync({ userId: "A", provider: "ibkr_flex" }, depsFor(boom));
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();
    expect(conn.syncingSince).toBeNull();
    expect(_inFlightCount()).toBe(0);
    if (out.status !== "done") throw new Error("expected done");
    expect(out.summary.status).toBe("FAILED");
    expect(JSON.stringify(out) + logged).not.toContain(TOKEN);
  });

  it("a token problem flips to needs-reconnect with exactly one notification", async () => {
    const conn = world.addConnection("A");
    const expired: BrokerProvider = {
      ...providerFor(""),
      async checkCredentials() {
        return { ok: false, kind: "reconnect", code: "ibkr_1012", message: "Your IBKR token has expired. Create a new one in IBKR and reconnect.", ibkrCode: 1012 };
      },
    };
    const out = await runSync({ userId: "A", provider: "ibkr_flex" }, depsFor(expired));
    if (out.status !== "done") throw new Error("expected done");
    expect(out.summary.status).toBe("NEEDS_RECONNECT");
    expect(conn.status).toBe("NEEDS_RECONNECT");
    expect(world.notifications).toHaveLength(1);
    // A second attempt is refused; no second notification.
    const again = await runSync({ userId: "A", provider: "ibkr_flex" }, depsFor(expired));
    expect(again.status).toBe("refused");
    expect(world.notifications).toHaveLength(1);
  });

  it("an ordinary failure does not change the connection state", async () => {
    const conn = world.addConnection("A");
    const busy: BrokerProvider = {
      ...providerFor(""),
      async fetchActivity() {
        return { ok: false, kind: "retry", code: "ibkr_1009", message: "Interactive Brokers is busy right now. Try again in a few minutes.", ibkrCode: 1009 };
      },
    };
    const out = await runSync({ userId: "A", provider: "ibkr_flex" }, depsFor(busy));
    if (out.status !== "done") throw new Error("expected done");
    expect(out.summary.status).toBe("FAILED");
    expect(conn.status).toBe("ACTIVE");
    expect(world.notifications).toHaveLength(0);
  });

  it("a key that no longer decrypts the token marks needs-reconnect with the plain message", async () => {
    const conn = world.addConnection("A");
    conn.encryptedToken = "v1:AAAA:BBBB:CCCC";
    const out = await runSync({ userId: "A", provider: "ibkr_flex" }, depsFor(providerFor(STATEMENT_TRADES)));
    if (out.status !== "done") throw new Error("expected done");
    expect(out.summary.status).toBe("NEEDS_RECONNECT");
    expect(out.summary.message).toBe("We can't read your saved connection any more. Please reconnect.");
  });

  it("the server-wide ceiling refuses the sixth simultaneous sync", async () => {
    const releases: (() => void)[] = [];
    const slowFor = (): BrokerProvider => ({
      ...providerFor(STATEMENT_TRADES),
      fetchActivity: () =>
        new Promise((resolve) => releases.push(() => resolve({ ok: true, body: STATEMENT_TRADES }))),
    });
    const users = Array.from({ length: MAX_SYNCS_IN_FLIGHT + 1 }, (_, i) => `U${i}`);
    users.forEach((u) => world.addConnection(u));
    const running = users
      .slice(0, MAX_SYNCS_IN_FLIGHT)
      .map((u) => runSync({ userId: u, provider: "ibkr_flex" }, depsFor(slowFor())));
    await vi.waitFor(() => expect(releases).toHaveLength(MAX_SYNCS_IN_FLIGHT));
    const sixth = await runSync({ userId: users[MAX_SYNCS_IN_FLIGHT], provider: "ibkr_flex" }, depsFor(slowFor()));
    expect(sixth).toMatchObject({ status: "refused", code: "server_busy" });
    releases.forEach((r) => r());
    await Promise.all(running);
    expect(_inFlightCount()).toBe(0);
  });
});

describe("cross-user isolation", () => {
  it("user B cannot sync, read or use user A's connection or token", async () => {
    world.addConnection("A");
    const calls = { send: 0, get: 0 };
    const out = await runSync({ userId: "B", provider: "ibkr_flex" }, depsFor(providerFor(STATEMENT_TRADES, calls)));
    expect(out).toMatchObject({ status: "refused", code: "no_connection" });
    expect(calls).toEqual({ send: 0, get: 0 });
    expect(world.runs).toHaveLength(0);
  });

  it("A's ciphertext copied onto B's row does not decrypt, so B's sync cannot use A's token", async () => {
    const a = world.addConnection("A");
    const b = world.addConnection("B", "TESTTOKEN-B-OWN-TOKEN-1");
    b.encryptedToken = a.encryptedToken;
    const out = await runSync({ userId: "B", provider: "ibkr_flex" }, depsFor(providerFor(STATEMENT_TRADES)));
    if (out.status !== "done") throw new Error("expected done");
    expect(out.summary.status).toBe("NEEDS_RECONNECT");
    expect(world.txns.filter((t) => t.userId === "B")).toHaveLength(0);
  });

  it("A's synced trades do not make B's identical statement look already imported", async () => {
    world.addConnection("A");
    world.addConnection("B");
    const d = depsFor(providerFor(STATEMENT_TRADES));
    await runSync({ userId: "A", provider: "ibkr_flex" }, d);
    const b = await runSync({ userId: "B", provider: "ibkr_flex" }, d);
    if (b.status !== "done") throw new Error("expected done");
    expect(b.summary.rowsAdded).toBe(3);
    expect(world.txns.filter((t) => t.userId === "A")).toHaveLength(3);
    expect(world.txns.filter((t) => t.userId === "B")).toHaveLength(3);
  });
});

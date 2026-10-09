import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks: the session, the database store, the sync wiring, next/cache ----
const state = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  pro: true,
  saved: [] as { userId: string; data: Record<string, unknown> }[],
  deleted: [] as string[],
  deleteCount: 1,
  syncCalls: [] as unknown[],
  fetchCalls: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/user-portfolio", () => ({ getSessionUserId: async () => state.userId }));
vi.mock("@/lib/plan-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/plan-access")>("@/lib/plan-access");
  return {
    ...actual,
    requirePro: async (userId: string, label: string) =>
      state.pro
        ? { ok: true, data: null }
        : { ok: false, error: `${label} is part of Pro, which is coming soon.`, code: "PRO_REQUIRED" },
  };
});
vi.mock("@/lib/broker/store", () => ({
  saveConnection: async (userId: string, _p: string, data: Record<string, unknown>) => {
    state.saved.push({ userId, data });
  },
  deleteConnection: async (userId: string) => {
    state.deleted.push(userId);
    return state.deleteCount;
  },
}));
vi.mock("@/lib/broker/sync-default", () => ({
  runSyncForUser: async (input: unknown) => {
    state.syncCalls.push(input);
    return {
      status: "done",
      runId: "run-1",
      summary: { status: "SUCCEEDED", rowsAdded: 3, rowsAlready: 0, rowsSkipped: 2, message: "3 trades added" },
    };
  },
}));
vi.mock("@/lib/broker/providers", () => ({
  getBrokerProvider: () => ({
    id: "ibkr_flex",
    displayName: "Interactive Brokers",
    checkCredentials: async (creds: { token: string }) => {
      state.fetchCalls += 1;
      if (creds.token === "EXPIRED-TOKEN-1234") {
        return { ok: false, kind: "reconnect", code: "ibkr_1012", message: "Your IBKR token has expired. Create a new one in IBKR and reconnect." };
      }
      return { ok: true, referenceCode: "999" };
    },
    fetchActivity: async () => ({ ok: false }),
  }),
}));

import { connectBroker, disconnectBroker, syncBrokerNow } from "@/app/actions/broker";
import { resetRateLimit, userKey } from "@/lib/rate-limit";
import { BROKER_DORMANT_MESSAGE } from "@/lib/broker/config";

const KEY = Buffer.alloc(32, 5).toString("base64");
const GOOD = { token: "FAKE-TOKEN-OK-123456", queryId: "123456" };

beforeEach(() => {
  process.env.BROKER_TOKEN_KEY = KEY;
  state.userId = "user-1";
  state.pro = true;
  state.saved = [];
  state.deleted = [];
  state.deleteCount = 1;
  state.syncCalls = [];
  state.fetchCalls = 0;
  for (const scope of ["broker-connect", "broker-sync", "broker-disconnect"]) {
    resetRateLimit(userKey(scope, "user-1"));
  }
});

describe("dormant (no key)", () => {
  beforeEach(() => {
    delete process.env.BROKER_TOKEN_KEY;
  });

  it("connect and sync give the honest answer with no network call and no token write", async () => {
    const c = await connectBroker(GOOD);
    const s = await syncBrokerNow();
    expect(c).toEqual({ ok: false, error: BROKER_DORMANT_MESSAGE });
    expect(s).toEqual({ ok: false, error: BROKER_DORMANT_MESSAGE });
    expect(state.fetchCalls).toBe(0);
    expect(state.syncCalls).toHaveLength(0);
    expect(state.saved).toHaveLength(0);
  });

  it("an invalid key is dormant too", async () => {
    process.env.BROKER_TOKEN_KEY = "too-short";
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await connectBroker(GOOD)).ok).toBe(false);
    expect(state.fetchCalls).toBe(0);
  });

  it("disconnect still works", async () => {
    const d = await disconnectBroker();
    expect(d).toEqual({ ok: true, data: { alreadyDisconnected: false } });
    expect(state.deleted).toEqual(["user-1"]);
  });
});

describe("Pro gate (enforced on the server)", () => {
  it("a Free user calling connect or sync directly gets PRO_REQUIRED and nothing happens", async () => {
    state.pro = false;
    const c = await connectBroker(GOOD);
    const s = await syncBrokerNow();
    expect(c).toMatchObject({ ok: false, code: "PRO_REQUIRED" });
    expect(s).toMatchObject({ ok: false, code: "PRO_REQUIRED" });
    expect(state.fetchCalls).toBe(0);
    expect(state.saved).toHaveLength(0);
  });

  it("a Free user can still disconnect", async () => {
    state.pro = false;
    expect((await disconnectBroker()).ok).toBe(true);
    expect(state.deleted).toEqual(["user-1"]);
  });

  it("Pro with the key on: connect saves an encrypted token and runs the first sync", async () => {
    const c = await connectBroker({ ...GOOD, expiresOn: "" });
    expect(c.ok).toBe(true);
    expect(state.saved).toHaveLength(1);
    const saved = state.saved[0];
    expect(saved.userId).toBe("user-1");
    expect(String(saved.data.encryptedToken).startsWith("v1:")).toBe(true);
    expect(JSON.stringify(saved.data)).not.toContain(GOOD.token);
    expect(state.syncCalls[0]).toMatchObject({ userId: "user-1", provider: "ibkr_flex", initialReferenceCode: "999" });
    // The result carries no token.
    expect(JSON.stringify(c)).not.toContain(GOOD.token);
  });
});

describe("connect validation and refusal", () => {
  it("the user id comes from the session; signed-out is refused", async () => {
    state.userId = null;
    expect((await connectBroker(GOOD)).ok).toBe(false);
    expect((await syncBrokerNow()).ok).toBe(false);
    expect((await disconnectBroker()).ok).toBe(false);
    expect(state.fetchCalls).toBe(0);
  });

  it("bad shapes are refused before any call, without echoing the input", async () => {
    const bad = await connectBroker({ token: "bad token <script>", queryId: "12" });
    const badQuery = await connectBroker({ token: GOOD.token, queryId: "abc" });
    const badDate = await connectBroker({ ...GOOD, expiresOn: "2001-01-01" });
    const farDate = await connectBroker({ ...GOOD, expiresOn: "2099-01-01" });
    expect(bad).toEqual({ ok: false, error: "That doesn't look like an IBKR Flex token." });
    expect(badQuery).toEqual({ ok: false, error: "The Query ID is a number, for example 123456." });
    expect(badDate.ok).toBe(false);
    expect(farDate.ok).toBe(false);
    expect(JSON.stringify([bad, badQuery])).not.toContain("script");
    expect(state.fetchCalls).toBe(0);
  });

  it("when IBKR refuses the token, nothing is saved and the token is not in the answer", async () => {
    const out = await connectBroker({ token: "EXPIRED-TOKEN-1234", queryId: "1" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain("expired");
      expect(out.error).toContain("Nothing was saved.");
      expect(out.error).not.toContain("EXPIRED-TOKEN-1234");
    }
    expect(state.saved).toHaveLength(0);
    expect(state.syncCalls).toHaveLength(0);
  });
});

describe("rate limits", () => {
  it("the 6th connect in an hour is refused with the standard message", async () => {
    for (let i = 0; i < 5; i++) expect((await connectBroker(GOOD)).ok).toBe(true);
    const sixth = await connectBroker(GOOD);
    expect(sixth.ok).toBe(false);
    if (!sixth.ok) expect(sixth.error).toMatch(/^Too many requests\. Please wait about \d+ seconds? and try again\.$/);
  });

  it("the 7th sync in an hour is refused with the standard message", async () => {
    for (let i = 0; i < 6; i++) expect((await syncBrokerNow()).ok).toBe(true);
    const seventh = await syncBrokerNow();
    expect(seventh.ok).toBe(false);
    if (!seventh.ok) expect(seventh.error).toMatch(/^Too many requests/);
  });
});

describe("isolation and secrets in the source", () => {
  const root = path.resolve(__dirname, "../..");
  const store = readFileSync(path.join(root, "src/lib/broker/store.ts"), "utf8");

  it("every broker query in store.ts is filtered by the user id", () => {
    const calls = [...store.matchAll(/\.(brokerConnection|brokerSyncRun)\.(\w+)\(/g)];
    expect(calls.length).toBeGreaterThan(8);
    for (const m of calls) {
      const slice = store.slice(m.index!, m.index! + 600);
      expect(slice, `${m[1]}.${m[2]} must mention userId`).toMatch(/userId/);
    }
  });

  it("only one function reads the encrypted token, and no view type has a token field", () => {
    const reads = [...store.matchAll(/encryptedToken: true/g)];
    expect(reads).toHaveLength(1);
    const types = readFileSync(path.join(root, "src/lib/broker/types.ts"), "utf8");
    const view = types.slice(types.indexOf("export type BrokerConnectionView"), types.indexOf("export type BrokerCardState"));
    expect(view.toLowerCase()).not.toMatch(/token|cipher|secret/);
    expect(view).toContain("expiryDateEntered");
  });

  it("no logger call or thrown error in the broker code mentions the token, address or reply", () => {
    const files = [
      ...readdirSync(path.join(root, "src/lib/broker")).filter((f) => f.endsWith(".ts")).map((f) => `src/lib/broker/${f}`),
      ...readdirSync(path.join(root, "src/lib/broker/ibkr-flex")).map((f) => `src/lib/broker/ibkr-flex/${f}`),
      "src/app/actions/broker.ts",
    ];
    for (const f of files) {
      const src = readFileSync(path.join(root, f), "utf8");
      const logs = [...src.matchAll(/logger\.\w+\(([\s\S]*?)\);/g)].map((m) => m[1]);
      for (const l of logs) {
        expect(l, `${f} logs`).not.toMatch(/\btoken\b|creds|\burl\b|body|response|error\.message|\.message/i);
      }
      const throws = [...src.matchAll(/throw new Error\(([^)]*)\)/g)].map((m) => m[1]);
      for (const t of throws) expect(t, `${f} throws`).not.toMatch(/token|url/i);
    }
  });
});

describe("migration and plans", () => {
  const root = path.resolve(__dirname, "../..");

  it("the migration is additive and cascades on the user links", () => {
    const dir = path.join(root, "prisma/migrations");
    const name = readdirSync(dir).find((d) => d.endsWith("_broker_connection"));
    expect(name).toBeTruthy();
    const sql = readFileSync(path.join(dir, name!, "migration.sql"), "utf8");
    expect(sql).not.toMatch(/DROP |RENAME /i);
    expect(sql).toMatch(/"BrokerConnection_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "user"\("id"\) ON DELETE CASCADE/);
    expect(sql).toMatch(/"BrokerSyncRun_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "user"\("id"\) ON DELETE CASCADE/);
    expect(sql).toMatch(/"BrokerSyncRun_connectionId_fkey" FOREIGN KEY \("connectionId"\) REFERENCES "BrokerConnection"\("id"\) ON DELETE CASCADE/);
    // The tag link empties (never deletes the trade) if a history row goes.
    expect(sql).toMatch(/"Transaction_syncRunId_fkey"[\s\S]*ON DELETE SET NULL/);
  });

  it("broker-connection stays coming soon in the plan list", async () => {
    const { PLAN_FEATURES } = await import("@/lib/plans");
    const row = (PLAN_FEATURES as unknown as { id?: string; key?: string; status?: string }[]).find(
      (f) => f.id === "broker-connection" || f.key === "broker-connection",
    );
    expect(row).toBeTruthy();
    expect(row!.status).toBe("coming_soon");
  });
});

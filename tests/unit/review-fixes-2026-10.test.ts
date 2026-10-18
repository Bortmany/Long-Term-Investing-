// Review fixes (Oct 2026): buys can't be removed from under sells, startup
// refuses a missing proxy setting, and shared instruments are checked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  session: "u1" as string | null,
  rows: [] as {
    id: string;
    portfolioId: string;
    type: string;
    instrumentId: string | null;
    quantity: { toNumber(): number } | null;
  }[],
  instruments: [] as { id: string; ticker: string; market: string }[],
  created: [] as unknown[],
  profile: null as null | { name: string; currency: string },
}));

const dec = (n: number) => ({ toNumber: () => n });
const trade = (id: string, type: string, q: number) => ({
  id, portfolioId: "pf", type, instrumentId: "ins", quantity: dec(q),
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/user-portfolio", () => ({
  getSessionUserId: async () => db.session,
  getOrCreatePortfolio: async () => ({ id: "pf" }),
}));
vi.mock("@/lib/portfolio-lock", () => ({ lockPortfolioForWrite: async () => {} }));
vi.mock("@/lib/portfolio", async (orig) => {
  const real = await orig<typeof import("@/lib/portfolio")>();
  return {
    ...real,
    fromPrismaTransaction: (t: (typeof db.rows)[number]) => ({
      type: t.type, instrumentId: t.instrumentId, quantity: t.quantity?.toNumber() ?? null,
      amount: 0, fee: 0, currency: "USD", pricePerUnit: null, tradeDate: new Date(),
    }),
  };
});
vi.mock("@/lib/data", async (orig) => ({
  ...(await orig<object>()),
  resolveProviderName: () => "fmp",
  getProfile: async () =>
    db.profile ? { ok: true, data: db.profile } : { ok: false, unavailable: "no_data" },
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    transaction: {
      findMany: async ({ where }: { where: { id: { not: string } } }) =>
        db.rows.filter((r) => r.id !== where.id.not),
      delete: async ({ where }: { where: { id: string } }) => {
        db.rows = db.rows.filter((r) => r.id !== where.id);
      },
      update: async () => {},
    },
  };
  return {
    prisma: {
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
      transaction: {
        ...tx.transaction,
        findFirst: async ({ where }: { where: { id: string } }) =>
          db.rows.find((r) => r.id === where.id) ?? null,
      },
      instrument: {
        findUnique: async ({ where }: { where: { id?: string; ticker_market?: { ticker: string } } }) =>
          where.id ? { ticker: "TST", currency: "USD" } : db.instruments.find((i) => i.ticker === where.ticker_market?.ticker) ?? null,
        create: async ({ data }: { data: { ticker: string } }) => {
          db.created.push(data);
          return { id: "new", ticker: data.ticker };
        },
      },
    },
  };
});

import { deleteTransaction, updateTransaction } from "@/app/actions/transactions";
import { createInstrument } from "@/app/actions/instruments";
import { findUncoveredSell } from "@/lib/position-check";
import { checkStartupSecrets } from "@/instrumentation";
import { resetRateLimit, userKey } from "@/lib/rate-limit";

beforeEach(() => {
  db.session = "u1";
  db.rows = [trade("b1", "BUY", 10), trade("s1", "SELL", 6)];
  db.instruments = [];
  db.created = [];
  db.profile = null;
  for (const scope of ["tx-write", "instrument-write"]) resetRateLimit(userKey(scope, "u1"));
});

describe("buys can't be removed or shrunk from under sells", () => {
  it("pure check finds a sell with no buy behind it", () => {
    expect(findUncoveredSell([{ type: "SELL", instrumentId: "a", quantity: 1 }])).toMatchObject({ sold: 1 });
    expect(findUncoveredSell([{ type: "BUY", instrumentId: "a", quantity: 1 }])).toBeNull();
  });

  it("refuses to delete a buy that backs a sell", async () => {
    const r = await deleteTransaction("b1");
    expect(r.ok).toBe(false);
    expect(db.rows).toHaveLength(2);
  });

  it("allows deleting a buy once the sell is gone, or when spare shares remain", async () => {
    db.rows.push(trade("b2", "BUY", 6));
    expect((await deleteTransaction("b1")).ok).toBe(true);
  });

  it("refuses to shrink a buy below what was sold, allows a safe edit", async () => {
    const base = { type: "BUY", instrumentId: "ins", pricePerUnit: 1, currency: "USD", fee: 0, tradeDate: new Date("2024-01-01") };
    expect((await updateTransaction("b1", { ...base, quantity: 5 } as never)).ok).toBe(false);
    expect((await updateTransaction("b1", { ...base, quantity: 8 } as never)).ok).toBe(true);
  });
});

describe("startup refuses a missing proxy setting in production", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  const prod = (trust?: string) => {
    process.env = {
      ...saved,
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "x".repeat(40),
      ...(trust === undefined ? {} : { TRUST_PROXY_HEADERS: trust }),
    } as never;
    if (trust === undefined) delete process.env.TRUST_PROXY_HEADERS;
  };
  it("throws when unset", () => {
    prod();
    expect(() => checkStartupSecrets()).toThrow(/TRUST_PROXY_HEADERS/);
  });
  it("starts when set to true", () => {
    prod("true");
    expect(() => checkStartupSecrets()).not.toThrow();
  });
});

describe("shared instruments are checked against the data source", () => {
  const input = { ticker: "aapl", name: "Fake Name", market: "US", currency: "EUR", type: "STOCK" } as never;
  it("refuses a wrong currency the source contradicts", async () => {
    db.profile = { name: "Apple Inc.", currency: "USD" };
    expect((await createInstrument(input)).ok).toBe(false);
    expect(db.created).toHaveLength(0);
  });
  it("uses the source's name over the typed one", async () => {
    db.profile = { name: "Apple Inc.", currency: "USD" };
    const r = await createInstrument({ ...(input as object), currency: "USD" } as never);
    expect(r.ok).toBe(true);
    expect(db.created[0]).toMatchObject({ name: "Apple Inc.", ticker: "AAPL" });
  });
  it("rejects a malformed ticker", async () => {
    expect((await createInstrument({ ...(input as object), ticker: "a b" } as never)).ok).toBe(false);
  });
});

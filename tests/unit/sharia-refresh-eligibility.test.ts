// The daily Sharia refresh covers only people who are Pro right now AND have
// the switch on. No database: a pretend client answers the store's queries.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { refreshShariaScreens } from "@/lib/sharia/refresh";
import { createShariaStore, type ShariaDb } from "@/lib/sharia/store";
import { fakeVendor, verdictResult } from "../support/fake-sharia-vendor";

const now = new Date("2026-10-04T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

type FakeUser = {
  id: string;
  shariaScreenEnabled: boolean;
  plan: "FREE" | "PRO";
  subscription: { status: string; currentPeriodEnd: Date | null; providerSubscriptionId: string | null } | null;
  holds: string[];
};

const paid = (status: string, endsInDays: number) => ({
  status,
  currentPeriodEnd: new Date(now.getTime() + endsInDays * DAY),
  providerSubscriptionId: "sub_1",
});

function fakeDb(users: FakeUser[]): ShariaDb {
  return {
    user: {
      findMany: async (args: { where: { shariaScreenEnabled: boolean } }) =>
        users
          .filter((u) => u.shariaScreenEnabled === args.where.shariaScreenEnabled)
          .map((u) => ({ id: u.id, plan: u.plan, subscription: u.subscription })),
    },
    instrument: {
      findMany: async (args: {
        where: { OR: { transactions: { some: { portfolio: { userId: { in: string[] } } } } }[] };
      }) => {
        const ids = args.where.OR[0].transactions.some.portfolio.userId.in;
        const tickers = new Set(users.filter((u) => ids.includes(u.id)).flatMap((u) => u.holds));
        return [...tickers].map((t) => ({ id: t, ticker: t, market: "US", shariaScreens: [] }));
      },
    },
    shariaScreen: { upsert: async () => ({}), deleteMany: async () => ({}) },
  } as unknown as ShariaDb;
}

async function run(users: FakeUser[]) {
  const vendor = fakeVendor({ PROON: verdictResult(), PROOFF: verdictResult(), FREEON: verdictResult(), LAPSED: verdictResult() });
  const store = createShariaStore(fakeDb(users), () => now);
  const summary = await refreshShariaScreens({ scope: "all-users", maxInstruments: 500 }, { vendor, store, now: () => now });
  return { vendor, summary };
}

const proOn: FakeUser = { id: "u1", shariaScreenEnabled: true, plan: "PRO", subscription: paid("active", 10), holds: ["PROON"] };
const proOff: FakeUser = { id: "u2", shariaScreenEnabled: false, plan: "PRO", subscription: paid("active", 10), holds: ["PROOFF"] };
const freeOn: FakeUser = { id: "u3", shariaScreenEnabled: true, plan: "FREE", subscription: null, holds: ["FREEON"] };
const lapsedOn: FakeUser = {
  id: "u4",
  shariaScreenEnabled: true,
  plan: "PRO",
  subscription: paid("canceled", -2),
  holds: ["LAPSED"],
};

describe("Sharia daily refresh: who is covered", () => {
  it("includes a Pro user with the switch on", async () => {
    const { vendor } = await run([proOn]);
    expect(vendor.calls).toEqual(["PROON"]);
  });

  it("includes an owner-granted Pro user (no subscription) with the switch on", async () => {
    const { vendor } = await run([{ ...proOn, subscription: null }]);
    expect(vendor.calls).toEqual(["PROON"]);
  });

  it("excludes Pro with the switch off, Free with it on, and lapsed Pro with it on", async () => {
    const { vendor } = await run([proOn, proOff, freeOn, lapsedOn]);
    expect(vendor.calls).toEqual(["PROON"]);
  });

  it("nobody eligible: skipped and no vendor call", async () => {
    const { vendor, summary } = await run([proOff, freeOn, lapsedOn]);
    expect(summary.status).toBe("skipped");
    expect(vendor.calls).toEqual([]);
  });
});

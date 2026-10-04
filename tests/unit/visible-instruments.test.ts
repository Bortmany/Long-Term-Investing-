// Private tickers: one person's typed-in stock must never reach another
// person's dropdowns or stock page. The fake database below applies each
// query's filter for real, so a query that forgot the scope would fail here.
import { describe, expect, it } from "vitest";
import type { Instrument } from "@prisma/client";

import {
  getVisibleInstrument,
  listVisibleInstruments,
  type VisibleInstrumentDb,
} from "@/lib/stocks/visible-instruments";

const base = { type: "STOCK", sector: null, country: null, createdAt: new Date(), updatedAt: new Date() };
const instruments = [
  { ...base, id: "pub-aapl", ticker: "AAPL", name: "Apple Inc.", market: "US", currency: "USD" },
  { ...base, id: "priv-a", ticker: "ZZPRIV1", name: "Secret A", market: "OTHER", currency: "USD" },
  { ...base, id: "priv-b", ticker: "BPRIV", name: "Secret B", market: "OTHER", currency: "USD" },
] as unknown as Instrument[];

type Where = Record<string, unknown>;
function matchInstrument(i: Instrument, where: Where): boolean {
  if (Array.isArray(where.AND)) return (where.AND as Where[]).every((w) => matchInstrument(i, w));
  if (Array.isArray(where.OR)) return (where.OR as Where[]).some((w) => matchInstrument(i, w));
  if (typeof where.id === "string") return i.id === where.id;
  if (where.id && typeof where.id === "object") return (where.id as { in: string[] }).in.includes(i.id);
  return i.ticker === where.ticker && i.market === where.market && i.currency === where.currency;
}

// Who references what.
const refs = {
  transaction: [{ owner: "A", instrumentId: "priv-a" }, { owner: "B", instrumentId: "priv-b" }],
  watchlist: [] as { owner: string; instrumentId: string }[],
  thesis: [] as { owner: string; instrumentId: string }[],
  alert: [] as { owner: string; instrumentId: string }[],
  ai: [] as { owner: string; subjectId: string }[],
};
function fakeDb(extra: Partial<typeof refs> = {}): VisibleInstrumentDb {
  const r = { ...refs, ...extra };
  const owned = <T extends { owner: string }>(rows: T[], where: Where) =>
    rows.filter((x) => x.owner === (where.userId ?? (where.portfolio as { userId: string })?.userId));
  return {
    transaction: { findMany: async (a) => owned(r.transaction, (a as { where: Where }).where) },
    watchlistItem: { findMany: async (a) => owned(r.watchlist, (a as { where: Where }).where) },
    thesis: { findMany: async (a) => owned(r.thesis, (a as { where: Where }).where) },
    alert: { findMany: async (a) => owned(r.alert, (a as { where: Where }).where) },
    aiAnalysis: { findMany: async (a) => owned(r.ai, (a as { where: Where }).where) },
    instrument: {
      findMany: async (a) => instruments.filter((i) => matchInstrument(i, (a as { where: Where }).where)),
      findFirst: async (a) => instruments.find((i) => matchInstrument(i, (a as { where: Where }).where)) ?? null,
    },
  };
}

describe("visible instruments", () => {
  it("user B cannot list user A's private instrument", async () => {
    const tickers = (await listVisibleInstruments("B", fakeDb())).map((i) => i.ticker);
    expect(tickers).not.toContain("ZZPRIV1");
  });

  it("user B cannot open user A's private instrument", async () => {
    expect(await getVisibleInstrument("B", "priv-a", fakeDb())).toBeNull();
  });

  it("public and the user's own instruments are still visible", async () => {
    const tickers = (await listVisibleInstruments("B", fakeDb())).map((i) => i.ticker);
    expect(tickers).toContain("AAPL");
    expect(tickers).toContain("BPRIV");
    expect((await getVisibleInstrument("B", "priv-b", fakeDb()))?.ticker).toBe("BPRIV");
    expect((await getVisibleInstrument("B", "pub-aapl", fakeDb()))?.ticker).toBe("AAPL");
    expect((await getVisibleInstrument("A", "priv-a", fakeDb()))?.ticker).toBe("ZZPRIV1");
  });

  it("watchlist, thesis, alert and AI references each make a stock visible to their owner only", async () => {
    for (const key of ["watchlist", "thesis", "alert"] as const) {
      const db = fakeDb({ [key]: [{ owner: "B", instrumentId: "priv-a" }] });
      expect((await getVisibleInstrument("B", "priv-a", db))?.ticker).toBe("ZZPRIV1");
      expect(await getVisibleInstrument("C", "priv-a", db)).toBeNull();
    }
    const ai = fakeDb({ ai: [{ owner: "B", subjectId: "priv-a" }] });
    expect((await getVisibleInstrument("B", "priv-a", ai))?.ticker).toBe("ZZPRIV1");
  });
});

// Import references: no double imports, per-user scoping, length cap, skipped
// rows never stored, fingerprint determinism (broker-file-presets spec s.4-6).
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: "user-1" as string | null }));
const db = vi.hoisted(() => ({
  existing: [] as Array<Record<string, unknown>>,
  createMany: vi.fn(),
  portfolioFindFirst: vi.fn(),
  txFindMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/portfolio-lock", () => ({ lockPortfolioForWrite: vi.fn(async () => undefined) }));
vi.mock("@/lib/user-portfolio", () => ({
  getSessionUserId: vi.fn(async () => session.userId),
  getOrCreatePortfolio: vi.fn(async () => ({ id: "pf-1" })),
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    transaction: { findMany: async () => db.existing, createMany: db.createMany },
  };
  return {
    prisma: {
      instrument: {
        findMany: async () => [
          { id: "id-aapl", ticker: "AAPL", market: "US", currency: "USD" },
        ],
      },
      portfolio: { findFirst: db.portfolioFindFirst },
      transaction: { findMany: db.txFindMany },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

import {
  getKnownImportReferences,
  importTransactions,
  validateImportRows,
} from "@/app/actions/import-transactions";
import {
  PRESET_OVERSELL_HINT,
  assignFingerprintReferences,
  fingerprintRow,
  validateMappedRows,
  type KnownInstrument,
  type MappedImportRow,
} from "@/lib/import-rows";

const buy = (reference?: string, quantity = "10"): MappedImportRow => ({
  ticker: "AAPL",
  market: "US",
  type: "BUY",
  quantity,
  pricePerUnit: "100",
  currency: "USD",
  tradeDate: "2026-03-01",
  ...(reference ? { reference } : {}),
});

beforeEach(() => {
  vi.clearAllMocks();
  session.userId = `user-${Math.random()}`; // fresh rate-limit bucket
  db.existing = [];
});

describe("importTransactions - no double imports", () => {
  it("stores the reference and imports fresh rows", async () => {
    const result = await importTransactions([buy("trading212:a"), buy("trading212:b")]);
    expect(result).toEqual({ ok: true, data: { imported: 2, alreadyImportedCount: 0 } });
    const data = db.createMany.mock.calls[0][0].data;
    expect(data.map((d: { importReference: string }) => d.importReference)).toEqual([
      "trading212:a",
      "trading212:b",
    ]);
    expect(data[0].portfolioId).toBe("pf-1");
    // `line` is never stored
    expect(data[0]).not.toHaveProperty("line");
  });

  it("skips rows whose reference is already in the portfolio and counts them", async () => {
    db.existing = [
      {
        id: "t1",
        type: "BUY",
        instrumentId: "id-aapl",
        quantity: new Prisma.Decimal("10"),
        pricePerUnit: new Prisma.Decimal("100"),
        amount: new Prisma.Decimal("1000"),
        currency: "USD",
        fee: new Prisma.Decimal("0"),
        tradeDate: new Date("2026-02-01"),
        createdAt: new Date("2026-02-01"),
        importReference: "trading212:a",
      },
    ];
    const result = await importTransactions([buy("trading212:a"), buy("trading212:b")]);
    expect(result).toEqual({ ok: true, data: { imported: 1, alreadyImportedCount: 1 } });
    const data = db.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(1);
    expect(data[0].importReference).toBe("trading212:b");
  });

  it("never duplicates a reference repeated inside one upload", async () => {
    const result = await importTransactions([buy("x:1"), buy("x:1")]);
    expect(result).toEqual({ ok: true, data: { imported: 1, alreadyImportedCount: 1 } });
  });

  it("writes nothing when every row is already imported", async () => {
    db.existing = [{ importReference: "x:1", type: "DEPOSIT", instrumentId: null, quantity: null, pricePerUnit: null, amount: new Prisma.Decimal("1"), currency: "USD", fee: new Prisma.Decimal("0"), tradeDate: new Date("2026-01-01"), createdAt: new Date("2026-01-01"), id: "t" }];
    const result = await importTransactions([buy("x:1")]);
    expect(result).toEqual({ ok: true, data: { imported: 0, alreadyImportedCount: 1 } });
    expect(db.createMany).not.toHaveBeenCalled();
  });

  it("rows without a reference are stored with a null reference", async () => {
    await importTransactions([buy()]);
    expect(db.createMany.mock.calls[0][0].data[0].importReference).toBeNull();
  });

  it("a bad row blocks the whole import: nothing (not even a skipped row) is stored", async () => {
    const result = await importTransactions([buy("x:1"), { ...buy("x:2"), quantity: "abc" }]);
    expect(result.ok).toBe(false);
    expect(db.createMany).not.toHaveBeenCalled();
  });

  it("still refuses a future-dated row that carries a reference", async () => {
    const result = await importTransactions([{ ...buy("x:1"), tradeDate: "2999-01-01" }]);
    expect(result.ok).toBe(false);
    expect(db.createMany).not.toHaveBeenCalled();
  });

  it("an already-imported row does not count toward the oversell check", async () => {
    // A SELL of 5 with the BUY already imported would have been fine, but with
    // nothing held and the BUY left out, the sell must be refused.
    db.existing = [{ importReference: "x:buy", type: "DEPOSIT", instrumentId: null, quantity: null, pricePerUnit: null, amount: new Prisma.Decimal("1"), currency: "USD", fee: new Prisma.Decimal("0"), tradeDate: new Date("2026-01-01"), createdAt: new Date("2026-01-01"), id: "t" }];
    const result = await importTransactions([
      buy("x:buy", "10"),
      { ...buy("x:sell", "5"), type: "SELL" },
    ]);
    expect(result.ok).toBe(false);
    expect(db.createMany).not.toHaveBeenCalled();
  });
});

describe("reference length cap and argument guard", () => {
  it("refuses a reference over 200 characters (validate and import)", async () => {
    const long = "x".repeat(201);
    const v = await validateImportRows([buy(long)]);
    expect(v.ok).toBe(false);
    const i = await importTransactions([buy(long)]);
    expect(i.ok).toBe(false);
    expect(db.createMany).not.toHaveBeenCalled();
  });

  it("accepts a 200-character reference and an integer line", async () => {
    const v = await validateImportRows([{ ...buy("x".repeat(200)), line: 7 }]);
    expect(v.ok).toBe(true);
  });

  it("refuses a non-integer line", async () => {
    const v = await validateImportRows([{ ...buy("a"), line: 1.5 }]);
    expect(v.ok).toBe(false);
  });
});

describe("getKnownImportReferences - scoped to the signed-in user", () => {
  it("refuses when signed out and touches no data", async () => {
    session.userId = null;
    const r = await getKnownImportReferences("pf-1");
    expect(r.ok).toBe(false);
    expect(db.portfolioFindFirst).not.toHaveBeenCalled();
    expect(db.txFindMany).not.toHaveBeenCalled();
  });

  it("looks the portfolio up by the session user id and returns its references", async () => {
    db.portfolioFindFirst.mockResolvedValue({ id: "pf-1" });
    db.txFindMany.mockResolvedValue([
      { importReference: "a:1" },
      { importReference: null },
      { importReference: "a:2" },
    ]);
    const r = await getKnownImportReferences("pf-1");
    expect(r).toEqual({ ok: true, references: ["a:1", "a:2"] });
    expect(db.portfolioFindFirst.mock.calls[0][0].where).toEqual({
      id: "pf-1",
      userId: session.userId,
    });
    expect(db.txFindMany.mock.calls[0][0].where.portfolioId).toBe("pf-1");
  });

  it("someone else's portfolio id gets a refusal and no references", async () => {
    db.portfolioFindFirst.mockResolvedValue(null);
    const r = await getKnownImportReferences("pf-of-another-user");
    expect(r.ok).toBe(false);
    expect(db.txFindMany).not.toHaveBeenCalled();
  });
});

describe("oversell message for preset rows", () => {
  const instruments: KnownInstrument[] = [
    { id: "id-aapl", ticker: "AAPL", market: "US", currency: "USD" },
  ];
  const sell = (reference?: string): MappedImportRow => ({
    ...buy(reference, "5"),
    type: "SELL",
  });

  it("adds the spec sentence for a preset reference", async () => {
    const v = await validateImportRows([sell("trading212:s")]);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.data.results[0].ok).toBe(false);
    const issue = v.data.results[0].ok ? "" : v.data.results[0].issues[0];
    expect(issue).toContain(PRESET_OVERSELL_HINT);
    expect(PRESET_OVERSELL_HINT).toContain("stock split");
  });

  it("does not add it for Other-path fingerprints or rows with no reference", async () => {
    for (const ref of [undefined, "other:h:abc#1"]) {
      const v = await validateImportRows([sell(ref)]);
      if (!v.ok) throw new Error("unexpected");
      const issue = v.data.results[0].ok ? "" : v.data.results[0].issues[0];
      expect(issue).not.toContain("stock split");
    }
    // Report shape is unchanged and pure helper agrees.
    expect(validateMappedRows([buy("a")], instruments).validCount).toBe(1);
  });
});

describe("fingerprintRow", () => {
  it("is deterministic and ignores case, spacing and the note", () => {
    const a = fingerprintRow({ ...buy(), note: "one" });
    const b = fingerprintRow({ ...buy(), ticker: " aapl ", note: "two" });
    expect(a).toBe(b);
    expect(a.startsWith("other:h:")).toBe(true);
  });

  it("changes when an important value changes", () => {
    expect(fingerprintRow(buy())).not.toBe(fingerprintRow(buy(undefined, "11")));
  });

  it("numbers identical rows #1, #2 so genuine twin fills both stay", () => {
    const refs = assignFingerprintReferences([buy(), buy(), buy(undefined, "3")]);
    expect(refs[0].endsWith("#1")).toBe(true);
    expect(refs[1].endsWith("#2")).toBe(true);
    expect(refs[2].endsWith("#1")).toBe(true);
    expect(assignFingerprintReferences([buy(), buy()])).toEqual(refs.slice(0, 2));
  });
});

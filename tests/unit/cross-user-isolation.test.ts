// Cross-user isolation: a signed-in person can never change or delete another
// person's rows. The fake database below applies each query's `where` for real
// (id AND owner), so a query that forgot the owner would let the test through.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; owner: string; portfolioId?: string; status?: string; instrumentId?: string | null };

const db = vi.hoisted(() => ({
  session: "user-b" as string | null,
  transactions: [] as Row[],
  alerts: [] as Row[],
  theses: [] as Row[],
}));

function matches(row: Row, where: Record<string, unknown>): boolean {
  if (where.id && where.id !== row.id) return false;
  if (where.userId && where.userId !== row.owner) return false;
  const portfolio = where.portfolio as { userId?: string } | undefined;
  if (portfolio?.userId && portfolio.userId !== row.owner) return false;
  return true;
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/user-portfolio", () => ({
  getSessionUserId: async () => db.session,
  getOrCreatePortfolio: async () => ({ id: "pb" }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        db.transactions.find((r) => matches(r, where)) ?? null,
      delete: async ({ where }: { where: { id: string } }) => {
        db.transactions = db.transactions.filter((r) => r.id !== where.id);
      },
    },
    alert: {
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const before = db.alerts.length;
        db.alerts = db.alerts.filter((r) => !matches(r, where));
        return { count: before - db.alerts.length };
      },
    },
    thesis: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        db.theses.find((r) => matches(r, where)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        const row = db.theses.find((r) => r.id === where.id);
        if (row) row.status = data.status;
      },
    },
  },
}));

import { deleteTransaction, updateTransaction } from "@/app/actions/transactions";
import { deleteAlert } from "@/app/actions/alerts";
import { closeThesis } from "@/app/actions/theses";
import { resetRateLimit, userKey } from "@/lib/rate-limit";

beforeEach(() => {
  db.session = "user-b";
  db.transactions = [{ id: "tx-a", owner: "user-a" }];
  db.alerts = [{ id: "al-a", owner: "user-a" }];
  db.theses = [{ id: "th-a", owner: "user-a", status: "ACTIVE", instrumentId: null }];
  for (const scope of ["tx-write", "alert-write", "thesis-write"]) {
    resetRateLimit(userKey(scope, "user-b"));
    resetRateLimit(userKey(scope, "user-a"));
  }
});

describe("another person's data is out of reach", () => {
  it("cannot delete someone else's transaction", async () => {
    const result = await deleteTransaction("tx-a");
    expect(result.ok).toBe(false);
    expect(db.transactions).toHaveLength(1);
  });

  it("cannot edit someone else's transaction", async () => {
    const result = await updateTransaction("tx-a", {
      type: "DEPOSIT",
      amount: 5,
      currency: "USD",
      tradeDate: new Date("2024-01-02"),
    } as never);
    expect(result.ok).toBe(false);
  });

  it("cannot delete someone else's alert", async () => {
    const result = await deleteAlert("al-a");
    expect(result.ok).toBe(false);
    expect(db.alerts).toHaveLength(1);
  });

  it("cannot close someone else's thesis", async () => {
    const result = await closeThesis("th-a");
    expect(result.ok).toBe(false);
    expect(db.theses[0].status).toBe("ACTIVE");
  });

  it("the owner can still do all of it (the fake is not just refusing everything)", async () => {
    db.session = "user-a";
    expect((await deleteAlert("al-a")).ok).toBe(true);
    expect((await closeThesis("th-a")).ok).toBe(true);
    expect((await deleteTransaction("tx-a")).ok).toBe(true);
    expect(db.transactions).toHaveLength(0);
  });

  it("signed-out callers are refused", async () => {
    db.session = null;
    expect((await deleteTransaction("tx-a")).ok).toBe(false);
    expect((await deleteAlert("al-a")).ok).toBe(false);
    expect(db.transactions).toHaveLength(1);
  });
});

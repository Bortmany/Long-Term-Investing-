// A buy or sell must use the stored stock's own currency (server-enforced).
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  instrument: { ticker: "2222", currency: "SAR" } as { ticker: string; currency: string } | null,
  created: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/user-portfolio", () => ({
  getSessionUserId: async () => "user-1",
  getOrCreatePortfolio: async () => ({ id: "p1" }),
}));
vi.mock("@/lib/portfolio-lock", () => ({ lockPortfolioForWrite: async () => {} }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    transaction: {
      findMany: async () => [],
      create: async () => {
        state.created += 1;
        return { id: "t1" };
      },
    },
  };
  return {
    prisma: {
      instrument: { findUnique: async () => state.instrument },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { createTransaction } from "@/app/actions/transactions";
import { validateMappedRow } from "@/lib/import-rows";
import { currencyMismatchMessage } from "@/lib/instrument-currency";
import { resetRateLimit, userKey } from "@/lib/rate-limit";

const buy = (currency: string) =>
  ({
    type: "BUY",
    instrumentId: "inst-1",
    quantity: 10,
    pricePerUnit: 30,
    fee: 0,
    currency,
    tradeDate: new Date("2024-01-02"),
  }) as never;

beforeEach(() => {
  state.instrument = { ticker: "2222", currency: "SAR" };
  state.created = 0;
  resetRateLimit(userKey("tx-write", "user-1"));
});

describe("trade currency must match the stored stock", () => {
  it("refuses a buy in a different currency, in plain English, and saves nothing", async () => {
    const result = await createTransaction(buy("USD"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("2222 trades in SAR");
      expect(result.error).toContain("USD");
    }
    expect(state.created).toBe(0);
  });

  it("accepts a buy in the stock's own currency", async () => {
    const result = await createTransaction(buy("SAR"));
    expect(result.ok).toBe(true);
    expect(state.created).toBe(1);
  });

  it("still says 'not tracked' for an unknown stock", async () => {
    state.instrument = null;
    const result = await createTransaction(buy("SAR"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("isn't tracked yet");
  });

  it("only applies to buys and sells", () => {
    const stock = { ticker: "2222", currency: "SAR" as const };
    expect(currencyMismatchMessage({ type: "SELL", currency: "USD" }, stock)).not.toBeNull();
    expect(currencyMismatchMessage({ type: "DIVIDEND", currency: "USD" }, stock)).toBeNull();
    expect(currencyMismatchMessage({ type: "BUY", currency: "SAR" }, stock)).toBeNull();
  });
});

describe("file imports follow the same currency rule", () => {
  const known = [{ id: "i1", ticker: "2222", market: "TADAWUL" as const, currency: "SAR" as const }];
  const row = (currency: string) => ({
    ticker: "2222",
    market: "TADAWUL",
    type: "BUY",
    quantity: "10",
    pricePerUnit: "30",
    currency,
    tradeDate: "2024-01-02",
  });

  it("refuses a row in another currency and accepts the right one", () => {
    const bad = validateMappedRow(row("USD"), 1, known);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues[0]).toContain("2222 trades in SAR");
    expect(validateMappedRow(row("SAR"), 2, known).ok).toBe(true);
  });
});

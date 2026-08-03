import { describe, expect, it } from "vitest";

import { computeHoldings } from "@/lib/portfolio/holdings";
import type { TxnInput } from "@/lib/portfolio/types";
import { transactionInputSchema, MONEY_MAX } from "@/lib/transaction-schema";
import { alertInputSchema } from "@/lib/alert-schema";
import { emailKey, getClientIp } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Finding 3 — holdings computation is deterministic on same-day ties, so the
// Dashboard and Portfolio pages (which query in different orders) always agree.
// ---------------------------------------------------------------------------
describe("computeHoldings determinism (finding 3)", () => {
  const day = new Date("2026-01-10");
  // Three trades on the SAME day whose result depends on processing order:
  // a BUY, then a SELL, then another BUY at a different price. The stable
  // tie-break is createdAt (then id), so the outcome must NOT depend on the
  // order the database happened to return the rows in.
  const rows: TxnInput[] = [
    { type: "BUY", instrumentId: "x", quantity: 10, pricePerUnit: 200, amount: 2000, currency: "USD", fee: 0, tradeDate: day, id: "a", createdAt: new Date("2026-01-10T09:00:00Z") },
    { type: "SELL", instrumentId: "x", quantity: 5, pricePerUnit: 210, amount: 1050, currency: "USD", fee: 0, tradeDate: day, id: "b", createdAt: new Date("2026-01-10T10:00:00Z") },
    { type: "BUY", instrumentId: "x", quantity: 10, pricePerUnit: 220, amount: 2200, currency: "USD", fee: 0, tradeDate: day, id: "c", createdAt: new Date("2026-01-10T11:00:00Z") },
  ];

  it("gives the same holding no matter the input order", () => {
    const forward = computeHoldings(rows)[0];
    const reversed = computeHoldings([...rows].reverse())[0];
    const shuffled = computeHoldings([rows[1], rows[2], rows[0]])[0];

    expect(reversed.quantity).toBeCloseTo(forward.quantity, 8);
    expect(reversed.costBasis).toBeCloseTo(forward.costBasis, 8);
    expect(shuffled.costBasis).toBeCloseTo(forward.costBasis, 8);
  });

  it("processes in createdAt order (buy, sell, buy)", () => {
    const holding = computeHoldings([...rows].reverse())[0];
    // a: buy 10@200 (cost 2000) → b: sell 5 at avg 200 (cost 1000, qty 5) →
    // c: buy 10@220 (cost +2200) ⇒ qty 15, cost 3200.
    expect(holding.quantity).toBeCloseTo(15, 8);
    expect(holding.costBasis).toBeCloseTo(3200, 8);
  });
});

// ---------------------------------------------------------------------------
// Finding 4 — huge numbers get a clean 400 (schema rejection), never a 500
// from a Postgres numeric overflow.
// ---------------------------------------------------------------------------
describe("numeric bounds (finding 4)", () => {
  const base = { currency: "USD", tradeDate: "2026-01-10" } as const;

  it("rejects an absurd quantity", () => {
    const parsed = transactionInputSchema.safeParse({
      type: "BUY",
      instrumentId: "x",
      quantity: 1e30,
      pricePerUnit: 5,
      ...base,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an absurd price, amount and fee", () => {
    expect(
      transactionInputSchema.safeParse({ type: "BUY", instrumentId: "x", quantity: 1, pricePerUnit: 1e30, ...base }).success,
    ).toBe(false);
    expect(
      transactionInputSchema.safeParse({ type: "DEPOSIT", amount: 1e30, ...base }).success,
    ).toBe(false);
    expect(
      transactionInputSchema.safeParse({ type: "BUY", instrumentId: "x", quantity: 1, pricePerUnit: 5, fee: 1e30, ...base }).success,
    ).toBe(false);
  });

  it("still accepts a large-but-sane value at the cap", () => {
    const parsed = transactionInputSchema.safeParse({
      type: "DEPOSIT",
      amount: MONEY_MAX,
      ...base,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an absurd alert price threshold", () => {
    const parsed = alertInputSchema.safeParse({
      kind: "PRICE_ABOVE",
      instrumentId: "x",
      threshold: 1e30,
    });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Finding 6 — the auth limiter's IP source ignores spoofable forwarding
// headers unless a trusted proxy is configured, and there is a per-account key.
// ---------------------------------------------------------------------------
describe("rate-limit IP trust + per-account key (finding 6)", () => {
  it("ignores x-forwarded-for unless the proxy is trusted", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4" });
    expect(getClientIp(headers, { trustProxyHeaders: false })).toBe("unknown");
    expect(getClientIp(headers, { trustProxyHeaders: true })).toBe("1.2.3.4");
  });

  it("takes only the first hop of x-forwarded-for when trusted", () => {
    const headers = new Headers({ "x-forwarded-for": "9.9.9.9, 1.1.1.1" });
    expect(getClientIp(headers, { trustProxyHeaders: true })).toBe("9.9.9.9");
  });

  it("builds a normalized per-account key (case/space-insensitive)", () => {
    expect(emailKey("auth", "  Ada@Example.com ")).toBe("auth:email:ada@example.com");
  });
});

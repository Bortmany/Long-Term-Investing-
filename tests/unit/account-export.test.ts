import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildAccountExport,
  type AccountExportRows,
  type ExportAccountRow,
  type ExportSessionRow,
} from "@/lib/account-export";

const now = new Date("2026-07-19T12:00:00Z");

/** Every table populated with one row, so "includes rows from every table" is provable. */
function fullRows(): AccountExportRows {
  return {
    user: { name: "Ada Lovelace", email: "ada@example.com", createdAt: now },
    accounts: [{ providerId: "credential", createdAt: now, updatedAt: now }],
    sessions: [{ createdAt: now, ipAddress: "203.0.113.5", userAgent: "Mozilla/5.0" }],
    portfolios: [
      {
        id: "portfolio-1",
        name: "My Portfolio",
        baseCurrency: "OMR",
        createdAt: now,
        updatedAt: now,
        transactions: [
          {
            id: "txn-1",
            portfolioId: "portfolio-1",
            instrumentId: "instrument-1",
            instrument: { ticker: "BKMB" },
            type: "BUY",
            quantity: new Prisma.Decimal("100"),
            pricePerUnit: new Prisma.Decimal("0.35"),
            amount: new Prisma.Decimal("35"),
            currency: "OMR",
            fee: new Prisma.Decimal("0.5"),
            tradeDate: now,
            note: null,
            createdAt: now,
          },
        ],
      },
    ],
    watchlist: [
      { id: "watch-1", note: "Watching for a dip", createdAt: now, instrument: { ticker: "AAPL" } },
    ],
    theses: [
      {
        id: "thesis-1",
        statement: "Durable moat, growing dividend.",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
        instrument: { ticker: "AAPL" },
        checks: [
          {
            id: "check-1",
            integrityScore: 80,
            recommendation: "INTACT",
            evidence: { note: "still holds" },
            model: "claude-test",
            createdAt: now,
          },
        ],
      },
    ],
    aiAnalyses: [
      {
        type: "HEALTH_SCORE",
        model: "claude-test",
        createdAt: now,
        dataAsOf: now,
        output: { score: 72 },
      },
    ],
    weeklyReviews: [{ period: "2026-W28", output: { summary: "steady" }, createdAt: now }],
    alerts: [
      {
        id: "alert-1",
        kind: "PRICE_ABOVE",
        status: "ACTIVE",
        threshold: new Prisma.Decimal("0.4"),
        intervalDays: null,
        lastEvaluatedAt: now,
        lastTriggeredAt: null,
        lastOutcome: "Not triggered yet.",
        createdAt: now,
        instrument: { ticker: "BKMB" },
        thesis: null,
      },
    ],
    notifications: [
      {
        id: "notif-1",
        title: "BKMB rose above 0.400",
        body: "Price crossed your alert threshold.",
        priceAtTrigger: new Prisma.Decimal("0.41"),
        priceCurrency: "OMR",
        priceSource: "MANUAL",
        priceAsOf: now,
        readAt: null,
        createdAt: now,
      },
    ],
  };
}

describe("buildAccountExport", () => {
  it("includes rows from every table", () => {
    const result = buildAccountExport(fullRows(), now);

    expect(result.profile.email).toBe("ada@example.com");
    expect(result.accounts).toHaveLength(1);
    expect(result.sessions).toHaveLength(1);
    expect(result.portfolios).toHaveLength(1);
    expect(result.portfolios[0].transactions).toHaveLength(1);
    expect(result.watchlist).toHaveLength(1);
    expect(result.theses).toHaveLength(1);
    expect(result.theses[0].checks).toHaveLength(1);
    expect(result.aiAnalyses).toHaveLength(1);
    expect(result.weeklyReviews).toHaveLength(1);
    expect(result.alerts).toHaveLength(1);
    expect(result.notifications).toHaveLength(1);
  });

  it("converts every Decimal field to a plain number", () => {
    const result = buildAccountExport(fullRows(), now);
    const txn = result.portfolios[0].transactions[0];

    expect(typeof txn.quantity).toBe("number");
    expect(txn.quantity).toBe(100);
    expect(typeof txn.pricePerUnit).toBe("number");
    expect(typeof txn.amount).toBe("number");
    expect(typeof txn.fee).toBe("number");

    expect(typeof result.alerts[0].threshold).toBe("number");
    expect(result.alerts[0].threshold).toBe(0.4);
    expect(typeof result.notifications[0].priceAtTrigger).toBe("number");
    expect(result.notifications[0].priceAtTrigger).toBe(0.41);
  });

  // THE PRIVACY TEST: a credential or token riding along on a row (e.g. a
  // caller's Prisma query that forgot to `select` narrowly) must never reach
  // the exported JSON — buildAccountExport is the last line of defense.
  it("never lets a password hash or an OAuth token into the export", () => {
    const rows = fullRows();

    // Simulate a full Better Auth `account` row — the real Prisma type also
    // carries password/accessToken/refreshToken, which ExportAccountRow
    // deliberately omits. Cast past the narrow type to prove the *runtime*
    // behavior strips them, not just the compile-time type.
    const accountWithSecrets = {
      providerId: "credential",
      createdAt: now,
      updatedAt: now,
      password: "hash-value",
      accessToken: "should-not-leak-access-token",
      refreshToken: "should-not-leak-refresh-token",
      idToken: "should-not-leak-id-token",
    } as unknown as ExportAccountRow;
    rows.accounts = [accountWithSecrets];

    const sessionWithToken = {
      createdAt: now,
      ipAddress: "203.0.113.5",
      userAgent: "Mozilla/5.0",
      token: "should-not-leak-session-token",
    } as unknown as ExportSessionRow;
    rows.sessions = [sessionWithToken];

    const result = buildAccountExport(rows, now);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("hash-value");
    expect(serialized).not.toContain("should-not-leak-access-token");
    expect(serialized).not.toContain("should-not-leak-refresh-token");
    expect(serialized).not.toContain("should-not-leak-id-token");
    expect(serialized).not.toContain("should-not-leak-session-token");

    // The honest fields are still there — this isn't stripping everything.
    expect(serialized).toContain("credential");
  });
});

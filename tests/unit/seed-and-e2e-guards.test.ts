// The two "never on the live site" guards (go-public spec A8):
// - the seed creates NO demo login (and nothing hanging off one) when
//   NODE_ENV is production — only shared sample reference data;
// - the e2e setup, which creates a login with a known password, refuses to
//   run unless the database is on this machine and NODE_ENV isn't production.
// Both are pure checks, tested here without a database.

import { describe, expect, it } from "vitest";

import { isProductionSeed } from "../../prisma/seed-demo";
import { assertLocalTestDatabase } from "../e2e/local-db-guard";

describe("isProductionSeed", () => {
  it("production → no demo login", () => {
    expect(isProductionSeed({ NODE_ENV: "production" })).toBe(true);
  });

  it("development, test, or unset → the demo login is created", () => {
    expect(isProductionSeed({ NODE_ENV: "development" })).toBe(false);
    expect(isProductionSeed({ NODE_ENV: "test" })).toBe(false);
    expect(isProductionSeed({})).toBe(false);
  });
});

describe("assertLocalTestDatabase", () => {
  const local = "postgresql://me:pw@localhost:5432/investiq_align";

  it("allows a database on this machine", () => {
    expect(() => assertLocalTestDatabase({ DATABASE_URL: local })).not.toThrow();
    expect(() =>
      assertLocalTestDatabase({ DATABASE_URL: "postgresql://me:pw@127.0.0.1:5432/x" }),
    ).not.toThrow();
  });

  it("refuses a remote database", () => {
    expect(() =>
      assertLocalTestDatabase({ DATABASE_URL: "postgresql://me:pw@db.railway.internal:5432/x" }),
    ).toThrow(/on this machine/);
  });

  it("refuses a hostname that only starts with localhost", () => {
    expect(() =>
      assertLocalTestDatabase({ DATABASE_URL: "postgresql://me:pw@localhost.evil.example:5432/x" }),
    ).toThrow(/on this machine/);
  });

  it("refuses a missing or unreadable DATABASE_URL", () => {
    expect(() => assertLocalTestDatabase({})).toThrow();
    expect(() => assertLocalTestDatabase({ DATABASE_URL: "not a url" })).toThrow();
  });

  it("refuses production even with a local database", () => {
    expect(() => assertLocalTestDatabase({ DATABASE_URL: local, NODE_ENV: "production" })).toThrow(
      /production/,
    );
  });
});

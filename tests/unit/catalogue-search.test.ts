import { describe, expect, it } from "vitest";

import { PUBLIC_CATALOGUE } from "@/lib/public-catalogue";
import {
  buildStockSearchWhere,
  normalizeSearchQuery,
  resultsLine,
  SEARCH_MAX_QUERY_LENGTH,
  SEARCH_MAX_RESULTS,
} from "@/lib/stocks/catalogue-search";

describe("search query", () => {
  it("empty or all-spaces means no search", () => {
    expect(normalizeSearchQuery(undefined)).toBeNull();
    expect(normalizeSearchQuery("")).toBeNull();
    expect(normalizeSearchQuery("    ")).toBeNull();
  });
  it("is trimmed and capped at 60 characters", () => {
    expect(normalizeSearchQuery("  johnson ")).toBe("johnson");
    expect(normalizeSearchQuery("a".repeat(200))).toHaveLength(SEARCH_MAX_QUERY_LENGTH);
    expect(normalizeSearchQuery(["jnj", "x"])).toBe("jnj");
  });
  it("results never exceed 20", () => {
    expect(SEARCH_MAX_RESULTS).toBe(20);
  });
  it("results line is plain English", () => {
    expect(resultsLine(1, "jnj")).toBe('1 result for "jnj"');
    expect(resultsLine(3, "johnson")).toBe('3 results for "johnson"');
  });
});

describe("search scope", () => {
  it("covers exactly the public list plus the signed-in user's own stock ids", () => {
    const where = buildStockSearchWhere("john", ["mine-1", "mine-2"]);
    const scope = where.AND[0].OR;
    expect(scope[0]).toEqual({ id: { in: ["mine-1", "mine-2"] } });
    const pairs = scope.slice(1);
    expect(pairs).toHaveLength(PUBLIC_CATALOGUE.length);
    expect(pairs).toEqual(
      PUBLIC_CATALOGUE.map((e) => ({ ticker: e.ticker, market: e.market, currency: e.currency })),
    );
  });

  it("public-list matches carry the catalogue currency, so a same-ticker row in another currency is excluded", () => {
    const pairs = buildStockSearchWhere("x", []).AND[0].OR.slice(1);
    const bkmb = pairs.find((p) => "ticker" in p && p.ticker === "BKMB");
    expect(bkmb).toEqual({ ticker: "BKMB", market: "MSX", currency: "OMR" });
  });

  it("another user's stocks never enter the scope: it only ever contains the ids passed in", () => {
    const userA = buildStockSearchWhere("x", ["a-only"]);
    const userB = buildStockSearchWhere("x", ["b-only"]);
    expect(JSON.stringify(userB)).not.toContain("a-only");
    expect(JSON.stringify(userA)).not.toContain("b-only");
  });

  it("a user with nothing of their own still only searches the public list", () => {
    const where = buildStockSearchWhere("x", []);
    expect(where.AND[0].OR[0]).toEqual({ id: { in: [] } });
  });

  it("matches ticker or name, case-insensitively, as a parameterised filter", () => {
    const match = buildStockSearchWhere("JNJ", []).AND[1].OR;
    expect(match).toEqual([
      { ticker: { contains: "JNJ", mode: "insensitive" } },
      { name: { contains: "JNJ", mode: "insensitive" } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Cross-user isolation, run against a tiny in-memory copy of the shared stock
// table: the real filter from buildStockSearchWhere is evaluated row by row,
// the way the database would.
// ---------------------------------------------------------------------------
type Row = { id: string; ticker: string; name: string; market: string; currency: string };

function matches(row: Row, where: ReturnType<typeof buildStockSearchWhere>): boolean {
  const [scope, text] = where.AND;
  const inScope = scope.OR.some((clause) =>
    "id" in clause
      ? clause.id.in.includes(row.id)
      : clause.ticker === row.ticker &&
        clause.market === row.market &&
        clause.currency === row.currency,
  );
  const textMatch = text.OR.some((clause) => {
    if ("ticker" in clause) {
      return row.ticker.toLowerCase().includes(clause.ticker.contains.toLowerCase());
    }
    return row.name.toLowerCase().includes(clause.name.contains.toLowerCase());
  });
  return inScope && textMatch;
}

describe("cross-user isolation (simulated database)", () => {
  const table: Row[] = [
    // On the public list.
    { id: "jnj", ticker: "JNJ", name: "Johnson & Johnson", market: "US", currency: "USD" },
    // A same-ticker row in the wrong currency must not count as the public one.
    { id: "jnj-odd", ticker: "JNJ", name: "Johnson odd", market: "US", currency: "OMR" },
    // Typed in privately by user A only.
    { id: "a-secret", ticker: "ZQXA", name: "Alice Private Johnson Fund", market: "OTHER", currency: "USD" },
    // Typed in privately by user B only.
    { id: "b-secret", ticker: "ZQXB", name: "Bob Private Johnson Fund", market: "OTHER", currency: "USD" },
  ];
  const search = (query: string, ownIds: string[]) =>
    table.filter((row) => matches(row, buildStockSearchWhere(query, ownIds))).map((r) => r.id);

  it("user B never finds a stock that only user A created, holds or watches", () => {
    expect(search("johnson", ["b-secret"])).not.toContain("a-secret");
    expect(search("ZQXA", ["b-secret"])).toEqual([]);
  });

  it("user A never finds user B's private stock either", () => {
    expect(search("johnson", ["a-secret"])).not.toContain("b-secret");
    expect(search("ZQXB", ["a-secret"])).toEqual([]);
  });

  it("each user finds their own private stock plus the public list", () => {
    expect(search("johnson", ["a-secret"]).sort()).toEqual(["a-secret", "jnj"]);
    expect(search("johnson", ["b-secret"]).sort()).toEqual(["b-secret", "jnj"]);
  });

  it("a user with nothing of their own sees only the public list", () => {
    expect(search("johnson", [])).toEqual(["jnj"]);
  });

  it("the public-list row in the wrong currency is not found", () => {
    expect(search("odd", [])).toEqual([]);
  });
});

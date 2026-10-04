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

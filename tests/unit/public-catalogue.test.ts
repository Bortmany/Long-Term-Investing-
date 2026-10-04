import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Market } from "@prisma/client";

import {
  PUBLIC_CATALOGUE,
  findPublicEntry,
  findPublicEntryIgnoringCase,
  isUrlSafeTicker,
  publicPath,
  resolvePublicStocks,
  type PublicInstrumentSource,
} from "@/lib/public-catalogue";

describe("public list", () => {
  it("is the nine sample stocks", () => {
    expect(PUBLIC_CATALOGUE.map((e) => `${e.market}/${e.ticker}`).sort()).toEqual(
      [
        "US/AAPL",
        "US/MSFT",
        "US/KO",
        "US/O",
        "US/JNJ",
        "MSX/BKMB",
        "TADAWUL/2222.SR",
        "ADX/FAB",
        "QSE/QNBK",
      ].sort(),
    );
  });

  it("every ticker is safe in an address and every market is real", () => {
    for (const e of PUBLIC_CATALOGUE) {
      expect(isUrlSafeTicker(e.ticker)).toBe(true);
      expect(Object.values(Market)).toContain(e.market);
      expect(encodeURIComponent(e.ticker)).toBe(e.ticker);
    }
    expect(isUrlSafeTicker("A/B")).toBe(false);
    expect(isUrlSafeTicker("a b")).toBe(false);
    expect(isUrlSafeTicker("../x")).toBe(false);
  });

  it("has no duplicates", () => {
    const keys = PUBLIC_CATALOGUE.map(publicPath);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("stays in sync with the sample seed (same name, sector, country, currency, type)", () => {
    const seed = readFileSync("prisma/seed-demo.ts", "utf8");
    for (const e of PUBLIC_CATALOGUE) {
      const line = seed
        .split("\n")
        .find((l) => l.includes(`ticker: "${e.ticker}"`) && l.includes(`market: "${e.market}"`));
      expect(line, `${e.ticker} missing from seed-demo`).toBeTruthy();
      for (const fact of [e.name, e.sector, e.country, e.currency, e.type]) {
        expect(line).toContain(`"${fact}"`);
      }
    }
  });

  it("finds exact matches only; wrong case is found only by the redirect helper", () => {
    expect(findPublicEntry("TADAWUL", "2222.SR")?.name).toBe("Saudi Aramco");
    expect(findPublicEntry("US", "ZZZZ")).toBeNull();
    expect(findPublicEntry("us", "aapl")).toBeNull();
    expect(findPublicEntryIgnoringCase("us", "aapl")?.ticker).toBe("AAPL");
    expect(findPublicEntryIgnoringCase("US", "ZZZZ")).toBeNull();
  });
});

function fakeDb(rows: { id: string; ticker: string; market: Market; currency: string }[]) {
  return {
    instrument: {
      async findMany() {
        return rows;
      },
    },
  } as unknown as PublicInstrumentSource;
}

describe("list + database rule", () => {
  it("keeps only listed stocks that have a row with the listed currency", async () => {
    const db = fakeDb([
      { id: "1", ticker: "AAPL", market: "US", currency: "USD" },
      { id: "2", ticker: "MSFT", market: "US", currency: "SAR" }, // wrong currency
      { id: "3", ticker: "MYPRIVATE", market: "US", currency: "USD" }, // user-typed
    ]);
    const out = await resolvePublicStocks(db);
    expect(out.map((r) => r.entry.ticker)).toEqual(["AAPL"]);
  });
});

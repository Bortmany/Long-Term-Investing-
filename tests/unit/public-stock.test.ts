import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  decidePublicPrice,
  getPublicStockPageData,
  type PublicStockDb,
  type StoredPriceRow,
} from "@/lib/public-stock";
import { findPublicEntry, PUBLIC_CATALOGUE } from "@/lib/public-catalogue";
import { PUBLIC_COPY, allPublicSentences, researchCards } from "@/lib/public-stock-copy";

const now = new Date("2026-10-04T12:00:00Z");
const aapl = findPublicEntry("US", "AAPL")!;
const fresh = (source: StoredPriceRow["source"]): StoredPriceRow => ({
  price: 232.5,
  currency: "USD",
  asOf: new Date("2026-10-03T00:00:00Z"),
  source,
});
const none = {} as NodeJS.ProcessEnv;
const bothOn = {
  FMP_PUBLIC_DISPLAY_LICENSED: "true",
  TWELVE_DATA_PUBLIC_DISPLAY_LICENSED: "true",
} as unknown as NodeJS.ProcessEnv;

describe("public price decision", () => {
  it("FMP with the flag off: no price", () => {
    expect(decidePublicPrice(fresh("FMP"), aapl, now, none).kind).toBe("sign_in");
  });
  it("FMP with its flag on: price with source and date", () => {
    const env = { FMP_PUBLIC_DISPLAY_LICENSED: "true" } as unknown as NodeJS.ProcessEnv;
    const d = decidePublicPrice(fresh("FMP"), aapl, now, env);
    expect(d).toMatchObject({ kind: "price", price: 232.5, currency: "USD", source: "FMP" });
  });
  it("Twelve Data needs its own flag", () => {
    const fmpOnly = { FMP_PUBLIC_DISPLAY_LICENSED: "true" } as unknown as NodeJS.ProcessEnv;
    expect(decidePublicPrice(fresh("TWELVE_DATA"), aapl, now, fmpOnly).kind).toBe("sign_in");
    expect(decidePublicPrice(fresh("TWELVE_DATA"), aapl, now, bothOn).kind).toBe("price");
  });
  it("MANUAL and SEED never show, even with both flags on", () => {
    expect(decidePublicPrice(fresh("MANUAL"), aapl, now, bothOn).kind).toBe("sign_in");
    expect(decidePublicPrice(fresh("SEED"), aapl, now, bothOn).kind).toBe("sign_in");
  });
  it("no stored price, one older than 7 days, or the wrong currency: sign in", () => {
    expect(decidePublicPrice(null, aapl, now, bothOn).kind).toBe("sign_in");
    const old = { ...fresh("FMP"), asOf: new Date("2026-09-20T00:00:00Z") };
    expect(decidePublicPrice(old, aapl, now, bothOn).kind).toBe("sign_in");
    expect(decidePublicPrice({ ...fresh("FMP"), currency: "SAR" }, aapl, now, bothOn).kind).toBe(
      "sign_in",
    );
  });
  it("a zero or broken price is never shown", () => {
    expect(decidePublicPrice({ ...fresh("FMP"), price: 0 }, aapl, now, bothOn).kind).toBe("sign_in");
    expect(decidePublicPrice({ ...fresh("FMP"), price: NaN }, aapl, now, bothOn).kind).toBe(
      "sign_in",
    );
  });
});

describe("page data function: shared tables only, no user data", () => {
  function db(priceRow: unknown) {
    const findPrice = vi.fn(async () => priceRow);
    const fake = {
      instrument: {
        findMany: vi.fn(async () => [
          { id: "inst1", ticker: "AAPL", market: "US", currency: "USD" },
        ]),
      },
      priceCache: { findFirst: findPrice },
    } as unknown as PublicStockDb;
    return { fake, findPrice };
  }

  it("reads the newest stored price by instrument only (no user in the query)", async () => {
    const { fake, findPrice } = db({
      price: { toNumber: () => 232.5 },
      currency: "USD",
      asOf: new Date("2026-10-03T00:00:00Z"),
      source: "FMP",
    });
    const out = await getPublicStockPageData(fake, aapl, now, bothOn);
    expect(out).toMatchObject({ ok: true, price: { kind: "price", price: 232.5 } });
    expect(findPrice).toHaveBeenCalledWith(
      expect.objectContaining({ where: { instrumentId: "inst1" } }),
    );
  });

  it("launch default (no flags): never a price", async () => {
    const { fake } = db({
      price: 232.5,
      currency: "USD",
      asOf: new Date("2026-10-03T00:00:00Z"),
      source: "FMP",
    });
    const out = await getPublicStockPageData(fake, aapl, now, none);
    expect(out).toMatchObject({ ok: true, price: { kind: "sign_in" } });
  });

  it("a listed stock with no matching row is not found", async () => {
    const fake = {
      instrument: { findMany: async () => [] },
      priceCache: { findFirst: async () => null },
    } as unknown as PublicStockDb;
    expect(await getPublicStockPageData(fake, aapl, now, none)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("the modules import nothing about users, typed-in prices, AI, sessions or the live provider", () => {
    for (const file of ["src/lib/public-stock.ts", "src/lib/public-catalogue.ts"]) {
      const source = readFileSync(file, "utf8");
      const imports = source
        .split("\n")
        .filter((l) => /^import\b/.test(l) || /^\} from /.test(l))
        .join("\n");
      for (const banned of [
        "market-data",
        "@/lib/data\"",
        "@/lib/data/provider\"",
        "@/lib/auth",
        "session",
        "portfolio",
        "@/lib/ai",
        "ManualPrice",
        "Transaction",
        "Watchlist",
      ]) {
        expect(imports, `${file} imports ${banned}`).not.toContain(banned);
      }
    }
  });

  it("the page itself reads no cookies, headers or session and is cached for 15 minutes", () => {
    const page = readFileSync("src/app/s/[market]/[ticker]/page.tsx", "utf8");
    expect(page).not.toMatch(/next\/headers|cookies\(|headers\(|auth\.api|getSession/);
    expect(page).toContain("export const revalidate = 900;");
  });
});

describe("public copy", () => {
  const banned = /\b(buy|sell|hold|recommend\w*|should|target price|fair value|suggested)\b/i;
  it("never uses advice wording (the not-advice footer line is the one allowed exception)", () => {
    for (const entry of PUBLIC_CATALOGUE) {
      for (const sentence of allPublicSentences(entry)) {
        expect(sentence, sentence).not.toMatch(banned);
      }
    }
  });
  it("explainer cards use only the first sentence of the P/E and P/B lines", () => {
    const cards = researchCards();
    expect(cards).toHaveLength(5);
    for (const card of cards) {
      expect(card.line).not.toMatch(/cheap/i);
    }
  });
  it("the price box copy has no figure in it", () => {
    expect(PUBLIC_COPY.priceBoxLine).not.toMatch(/\d/);
  });
});

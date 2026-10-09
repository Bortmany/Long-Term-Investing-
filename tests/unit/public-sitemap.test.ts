import { describe, expect, it } from "vitest";

import { buildRobots, buildSitemapItems, ROBOTS_DISALLOW } from "@/lib/public-sitemap";
import { PUBLIC_CATALOGUE, type PublicInstrumentSource } from "@/lib/public-catalogue";

const BASE = "https://investiq.example";

function dbWith(rows: { id: string; ticker: string; market: string; currency: string }[]) {
  return {
    instrument: { findMany: async () => rows },
  } as unknown as PublicInstrumentSource;
}

describe("sitemap contents", () => {
  const allRows = PUBLIC_CATALOGUE.map((e, i) => ({
    id: `id${i}`,
    ticker: e.ticker,
    market: e.market,
    currency: e.currency,
  }));

  it("lists the landing page, privacy, terms and every listed stock that exists", async () => {
    const items = await buildSitemapItems(dbWith(allRows), BASE);
    const urls = items.map((i) => i.url);
    expect(urls).toContain(`${BASE}/`);
    expect(urls).toContain(`${BASE}/privacy`);
    expect(urls).toContain(`${BASE}/terms`);
    expect(urls).toContain(`${BASE}/s/TADAWUL/2222.SR`);
    expect(urls).toHaveLength(3 + PUBLIC_CATALOGUE.length);
    expect(urls.every((u) => u.startsWith(BASE))).toBe(true);
    expect(items.every((i) => i.changeFrequency === "weekly")).toBe(true);
    expect(JSON.stringify(items)).not.toContain("lastModified");
  });

  it("never lists a user-created instrument or an in-app address", async () => {
    const items = await buildSitemapItems(
      dbWith([...allRows, { id: "x", ticker: "MYPRIVATE", market: "US", currency: "USD" }]),
      BASE,
    );
    const urls = items.map((i) => i.url);
    expect(urls.some((u) => u.includes("MYPRIVATE"))).toBe(false);
    expect(urls.some((u) => u.includes("/stocks/"))).toBe(false);
  });

  it("drops a stock whose stored currency differs from the list", async () => {
    const rows = allRows.map((r) => (r.ticker === "AAPL" ? { ...r, currency: "SAR" } : r));
    const urls = (await buildSitemapItems(dbWith(rows), BASE)).map((i) => i.url);
    expect(urls).not.toContain(`${BASE}/s/US/AAPL`);
  });

  it("a stock on the list with no row is absent", async () => {
    const urls = (await buildSitemapItems(dbWith([]), BASE)).map((i) => i.url);
    expect(urls).toHaveLength(3);
  });
});

describe("robots", () => {
  it("allows / and /s/, keeps the app and API out, names the sitemap", () => {
    const robots = buildRobots(BASE);
    expect(robots.sitemap).toBe(`${BASE}/sitemap.xml`);
    expect(robots.rules[0].allow).toEqual(["/", "/s/"]);
    for (const area of [
      "/dashboard",
      "/portfolio",
      "/stocks",
      "/watchlist",
      "/committee",
      "/reviews",
      "/theses",
      "/settings",
      "/api/",
    ]) {
      expect(ROBOTS_DISALLOW).toContain(area);
    }
  });
});

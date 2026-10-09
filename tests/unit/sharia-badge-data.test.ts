// getShariaBadgeData: nothing when the switch is off or the person isn't
// Pro (and the verdict store is never queried); shared verdicts; isolation.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { getShariaBadgeData } from "@/lib/sharia/badge-data";
import type { StoredShariaScreen } from "@/lib/sharia/types";

const now = new Date("2026-10-04T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const aapl = { id: "i1", ticker: "AAPL", name: "Apple Inc.", market: "US" };
const bkmb = { id: "i2", ticker: "BKMB", name: "Bank Muscat", market: "MSX" };

type ReadFn = (ids: string[], source: string) => Promise<Map<string, StoredShariaScreen>>;

const stored: StoredShariaScreen = {
  verdict: "COMPLIANT",
  source: "musaffa",
  methodName: "Fake method",
  methodVersion: "v1",
  asOf: new Date(now.getTime() - 5 * DAY),
  fetchedAt: new Date(now.getTime() - DAY),
};

function deps(over: Record<string, unknown> = {}) {
  const readScreens = vi.fn<ReadFn>(async () => new Map([["i1", stored]]));
  return {
    readScreens,
    d: {
      loadPreference: async () => true,
      isProFn: async () => true,
      activeVendor: "musaffa",
      configured: true,
      now,
      readScreens,
      ...over,
    },
  };
}

describe("getShariaBadgeData", () => {
  it("switch off: returns nothing and never queries the store", async () => {
    const { d, readScreens } = deps({ loadPreference: async () => false });
    expect(await getShariaBadgeData("u1", [aapl], d)).toBeNull();
    expect(readScreens).not.toHaveBeenCalled();
  });

  it("not Pro (switch saved on): returns nothing and never queries the store", async () => {
    const { d, readScreens } = deps({ isProFn: async () => false });
    expect(await getShariaBadgeData("u1", [aapl], d)).toBeNull();
    expect(readScreens).not.toHaveBeenCalled();
  });

  it("on and Pro: a verdict, a not-covered stock, and a stock with no row", async () => {
    const { d } = deps();
    const result = await getShariaBadgeData("u1", [aapl, bkmb, { ...aapl, id: "i3", ticker: "NONE" }], d);
    expect(result?.i1).toMatchObject({ state: "compliant", methodName: "Fake method", vendorName: "Musaffa" });
    expect(result?.i1.checkedLabel).toBe("Sep 29, 2026");
    expect(result?.i2).toMatchObject({ state: "not_screened", reason: "not_covered", exchangeName: "Muscat" });
    expect(result?.i3).toMatchObject({ state: "not_screened", reason: "no_verdict" });
  });

  it("no key: every stock is Not screened 'not_set_up' and the store is not queried", async () => {
    const { d, readScreens } = deps({ configured: false });
    const result = await getShariaBadgeData("u1", [aapl], d);
    expect(result?.i1).toMatchObject({ state: "not_screened", reason: "not_set_up" });
    expect(readScreens).not.toHaveBeenCalled();
  });

  it("a store failure shows Not screened, never a guess", async () => {
    const { d } = deps({
      readScreens: async () => {
        throw new Error("db down");
      },
    });
    const result = await getShariaBadgeData("u1", [aapl], d);
    expect(result?.i1).toMatchObject({ state: "not_screened", reason: "no_verdict" });
  });

  it("verdicts are shared: the read takes no user id, and one user's switch never affects another", async () => {
    const readScreens = vi.fn<ReadFn>(async () => new Map([["i1", stored]]));
    const prefs: Record<string, boolean> = { a: true, b: false };
    const base = { readScreens, isProFn: async () => true, activeVendor: "musaffa", configured: true, now };
    const loadPreference = async (id: string) => prefs[id];
    const a = await getShariaBadgeData("a", [aapl], { ...base, loadPreference });
    const b = await getShariaBadgeData("b", [aapl], { ...base, loadPreference });
    expect(a?.i1.state).toBe("compliant");
    expect(b).toBeNull();
    // The store is asked with instrument ids and the supplier only.
    expect(readScreens.mock.calls[0]).toEqual([["i1"], "musaffa"]);
  });
});

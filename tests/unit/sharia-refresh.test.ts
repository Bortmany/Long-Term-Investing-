import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { orderCandidates, refreshShariaScreens } from "@/lib/sharia/refresh";
import type { RefreshCandidate } from "@/lib/sharia/store";
import { fakeStore, fakeVendor, verdictResult, FAKE_AS_OF } from "../support/fake-sharia-vendor";

const now = new Date("2026-10-04T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function cand(id: string, market = "US", existing?: { fetchedDaysAgo: number; asOfDaysAgo?: number }): RefreshCandidate {
  return {
    id,
    ticker: id,
    market,
    existing: existing
      ? {
          fetchedAt: new Date(now.getTime() - existing.fetchedDaysAgo * DAY),
          asOf: new Date(now.getTime() - (existing.asOfDaysAgo ?? existing.fetchedDaysAgo) * DAY),
        }
      : null,
  };
}

const opts = { scope: "all-users" as const, maxInstruments: 500 };

describe("refreshShariaScreens", () => {
  it("writes a new row and replaces an old one", async () => {
    const store = fakeStore([cand("A"), cand("B", "US", { fetchedDaysAgo: 3 })], {
      rows: [["B", { verdict: "NOT_COMPLIANT", fetchedAt: new Date(now.getTime() - 3 * DAY) }]],
    });
    const vendor = fakeVendor({ A: verdictResult("COMPLIANT"), B: verdictResult("COMPLIANT") });
    const summary = await refreshShariaScreens(opts, { vendor, store, now: () => now });
    expect(summary).toMatchObject({ status: "ok", screened: 2 });
    expect(store.rows.get("A")?.verdict).toBe("COMPLIANT");
    expect(store.rows.get("B")).toEqual({ verdict: "COMPLIANT", fetchedAt: now });
  });

  it("DELETES the stored row when the supplier says no verdict (and counts unmapped words)", async () => {
    const store = fakeStore([cand("A", "US", { fetchedDaysAgo: 1 }), cand("B", "US", { fetchedDaysAgo: 1 })], {
      rows: [
        ["A", { verdict: "COMPLIANT", fetchedAt: now }],
        ["B", { verdict: "COMPLIANT", fetchedAt: now }],
      ],
    });
    const vendor = fakeVendor({ A: { kind: "no_verdict" }, B: { kind: "no_verdict", unmappedStatus: true } });
    const summary = await refreshShariaScreens(opts, { vendor, store, now: () => now });
    expect(summary).toMatchObject({ removed: 2, unmappedStatuses: 1, screened: 0 });
    expect(store.rows.size).toBe(0);
  });

  it("KEEPS the stored row when the supplier call fails", async () => {
    const store = fakeStore([cand("A", "US", { fetchedDaysAgo: 1 })], {
      rows: [["A", { verdict: "COMPLIANT", fetchedAt: now }]],
    });
    const vendor = fakeVendor({ A: { kind: "unavailable", reason: "error" } });
    const summary = await refreshShariaScreens(opts, { vendor, store, now: () => now });
    expect(summary).toMatchObject({ keptOnError: 1, stoppedEarly: false });
    expect(store.rows.has("A")).toBe(true);
  });

  it("skips and counts uncovered markets without asking the supplier", async () => {
    const store = fakeStore([cand("A"), cand("M", "MSX"), cand("Q", "QSE")]);
    const vendor = fakeVendor({ A: verdictResult() });
    const summary = await refreshShariaScreens(opts, { vendor, store, now: () => now });
    expect(summary.skippedUncovered).toBe(2);
    expect(vendor.calls).toEqual(["A"]);
  });

  it("stops the run on rate-limited or auth-failed and keeps what it stored", async () => {
    const list = Array.from({ length: 20 }, (_, i) => cand(`S${i}`));
    const store = fakeStore(list);
    const script: Record<string, ReturnType<typeof verdictResult>> = {};
    for (const c of list) script[c.id] = verdictResult();
    const vendor = fakeVendor(script);
    const original = vendor.fetchVerdict.bind(vendor);
    vendor.fetchVerdict = async (i) =>
      i.ticker === "S0" ? (vendor.calls.push("S0"), { kind: "unavailable", reason: "rate_limited" }) : original(i);
    const summary = await refreshShariaScreens(opts, { vendor, store, now: () => now });
    expect(summary.stoppedEarly).toBe(true);
    expect(vendor.calls.length).toBeLessThan(20);
  });

  it("respects the cap and the order: no row first, then oldest fetch first", async () => {
    const list = [
      cand("new1", "US", { fetchedDaysAgo: 1 }),
      cand("old", "US", { fetchedDaysAgo: 50 }),
      cand("none"),
      cand("mid", "US", { fetchedDaysAgo: 10 }),
    ];
    expect(orderCandidates(list).map((c) => c.id)).toEqual(["none", "old", "mid", "new1"]);
    const store = fakeStore(list);
    const vendor = fakeVendor({});
    const summary = await refreshShariaScreens({ scope: "all-users", maxInstruments: 2 }, { vendor, store, now: () => now });
    expect(summary.capReached).toBe(true);
    expect([...vendor.calls].sort()).toEqual(["none", "old"]);
  });

  it("does nothing when nobody has the switch on", async () => {
    const store = fakeStore([cand("A")], { enabledUsers: 0 });
    const vendor = fakeVendor({ A: verdictResult() });
    const summary = await refreshShariaScreens(opts, { vendor, store, now: () => now });
    expect(summary.status).toBe("skipped");
    expect(vendor.calls).toEqual([]);
  });

  it("is dormant with no supplier and makes no call", async () => {
    const summary = await refreshShariaScreens(opts, { vendor: null, store: fakeStore([cand("A")]) });
    expect(summary.status).toBe("dormant");
  });

  it("the backfill only fetches stocks without a usable verdict", async () => {
    const list = [
      cand("fresh", "US", { fetchedDaysAgo: 1, asOfDaysAgo: 5 }),
      cand("stale", "US", { fetchedDaysAgo: 1, asOfDaysAgo: 150 }),
      cand("none"),
    ];
    const vendor = fakeVendor({});
    await refreshShariaScreens(
      { scope: { userId: "u1" }, maxInstruments: 25, onlyWithoutUsableVerdict: true },
      { vendor, store: fakeStore(list), now: () => now },
    );
    expect([...vendor.calls].sort()).toEqual(["none", "stale"]);
  });

  it("the summary holds counts only (no per-stock or per-user detail)", async () => {
    const store = fakeStore([cand("SECRETTICKER")]);
    const vendor = fakeVendor({ SECRETTICKER: verdictResult() });
    const summary = await refreshShariaScreens(opts, { vendor, store, now: () => now });
    for (const value of Object.values(summary)) expect(["number", "boolean", "string"]).toContain(typeof value);
    expect(JSON.stringify(summary)).not.toContain("SECRETTICKER");
    expect(FAKE_AS_OF).toBeInstanceOf(Date);
  });
});

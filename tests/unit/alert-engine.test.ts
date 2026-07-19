import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ALERT_EVAL_MIN_INTERVAL_MS,
  ALERT_SWEEP_MAX_INSTRUMENTS,
  createPrismaAlertStore,
  sweepAlerts,
  type AlertRecord,
  type AlertStore,
} from "@/lib/alerts/engine";
import type { DataResult, InstrumentRef, Quote } from "@/lib/data";
import { prisma } from "@/lib/prisma";

const NOW = new Date("2026-07-19T12:00:00Z");
const USER_ID = "user-1";

function makeAlertRecord(overrides: Partial<AlertRecord> & { id: string }): AlertRecord {
  return {
    userId: USER_ID,
    kind: "PRICE_ABOVE",
    instrumentId: null,
    thesisId: null,
    threshold: null,
    intervalDays: null,
    lastEvaluatedAt: null,
    lastTriggeredAt: null,
    instrument: null,
    thesis: null,
    ...overrides,
  };
}

function makeInstrument(id: string, ticker = id.toUpperCase()): InstrumentRef {
  return { id, ticker, market: "US", currency: "USD" };
}

/**
 * A real, stateful in-memory AlertStore — so a sweep's writes are visible to
 * the NEXT sweep call in the same test, exactly like the Prisma-backed store
 * would behave. AlertRecord itself carries no `status` field (that's the
 * Prisma column the real store filters on internally); this fake tracks
 * status in a parallel Map so findDueAlerts/findTriggeredThesisAlerts can
 * decide what to return next, the same way a real WHERE clause would.
 */
function makeFakeAlertStore(seed: AlertRecord[] = []) {
  const alerts: AlertRecord[] = seed.map((a) => ({ ...a }));
  const statuses = new Map<string, "ACTIVE" | "PAUSED" | "TRIGGERED">(alerts.map((a) => [a.id, "ACTIVE"]));
  const outcomes = new Map<string, string>();
  const thesisChecks = new Map<string, Date[]>();
  const previousCloses = new Map<string, { price: number; asOf: Date } | null>();
  const notifications: { alertId: string; userId: string; title: string; body: string; hadPrice: boolean }[] = [];

  const store: AlertStore = {
    findDueAlerts: vi.fn(async (scope, now, minIntervalMs) => {
      const cutoff = new Date(now.getTime() - minIntervalMs);
      return alerts.filter((a) => {
        if (statuses.get(a.id) !== "ACTIVE") return false;
        if (scope !== "all-users" && a.userId !== scope.userId) return false;
        return !a.lastEvaluatedAt || a.lastEvaluatedAt < cutoff;
      });
    }),
    findTriggeredThesisAlerts: vi.fn(async (scope) =>
      alerts.filter((a) => {
        if (statuses.get(a.id) !== "TRIGGERED" || a.kind !== "THESIS_REVIEW_DUE") return false;
        if (scope !== "all-users" && a.userId !== scope.userId) return false;
        return true;
      }),
    ),
    latestThesisCheckAt: vi.fn(async (thesisId: string) => {
      const checks = thesisChecks.get(thesisId) ?? [];
      if (checks.length === 0) return null;
      return checks.reduce((a, b) => (a > b ? a : b));
    }),
    previousClose: vi.fn(async (instrumentId: string) => previousCloses.get(instrumentId) ?? null),
    recordNoFire: vi.fn(async (alertId: string, now: Date, outcome: string) => {
      const alert = alerts.find((a) => a.id === alertId);
      if (alert) alert.lastEvaluatedAt = now;
      outcomes.set(alertId, outcome);
    }),
    recordFire: vi.fn(async ({ alertId, userId, title, body, now, price }) => {
      notifications.push({ alertId, userId, title, body, hadPrice: Boolean(price) });
      const alert = alerts.find((a) => a.id === alertId);
      if (alert) {
        alert.lastEvaluatedAt = now;
        alert.lastTriggeredAt = now;
      }
      statuses.set(alertId, "TRIGGERED");
    }),
    rearmAlert: vi.fn(async (alertId: string) => {
      statuses.set(alertId, "ACTIVE");
      const alert = alerts.find((a) => a.id === alertId);
      if (alert) alert.lastEvaluatedAt = null;
    }),
  };

  return { store, alerts, statuses, outcomes, notifications, thesisChecks, previousCloses };
}

function okQuote(price: number, overrides: Partial<Quote> = {}): DataResult<Quote> {
  return {
    ok: true,
    data: { price, currency: "USD", asOf: NOW, source: "live", fetchedAt: NOW, ...overrides },
  };
}

describe("sweepAlerts — fires once, then no-op", () => {
  it("a PRICE_ABOVE alert fires on the first due sweep and is skipped on the next (now TRIGGERED)", async () => {
    const instrument = makeInstrument("inst-1", "AAPL");
    const { store, statuses, notifications } = makeFakeAlertStore([
      makeAlertRecord({
        id: "alert-1",
        kind: "PRICE_ABOVE",
        instrumentId: instrument.id,
        instrument,
        threshold: 100,
      }),
    ]);
    const getQuoteFn = vi.fn(async () => okQuote(150));

    const first = await sweepAlerts({ userId: USER_ID }, { store, getQuoteFn, now: NOW });
    expect(first.fired).toBe(1);
    expect(statuses.get("alert-1")).toBe("TRIGGERED");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].hadPrice).toBe(true);

    const second = await sweepAlerts({ userId: USER_ID }, { store, getQuoteFn, now: NOW });
    expect(second.due).toBe(0);
    expect(second.fired).toBe(0);
    expect(getQuoteFn).toHaveBeenCalledTimes(1); // never re-fetched for the now-TRIGGERED alert
  });
});

describe("sweepAlerts — honest outcomes when the quote is unavailable", () => {
  it("records lastOutcome and never creates a notification", async () => {
    const instrument = makeInstrument("inst-2", "BKMB");
    const { store, statuses, outcomes, notifications } = makeFakeAlertStore([
      makeAlertRecord({
        id: "alert-2",
        kind: "PRICE_BELOW",
        instrumentId: instrument.id,
        instrument,
        threshold: 0.4,
      }),
    ]);
    const getQuoteFn = vi.fn(async (): Promise<DataResult<Quote>> => ({
      ok: false,
      unavailable: "no_data",
      message: "No manually entered price for BKMB yet.",
    }));

    const summary = await sweepAlerts({ userId: USER_ID }, { store, getQuoteFn, now: NOW });

    expect(summary.fired).toBe(0);
    expect(summary.evaluated).toBe(1);
    expect(notifications).toHaveLength(0);
    expect(statuses.get("alert-2")).toBe("ACTIVE"); // stays active, just checked
    expect(outcomes.get("alert-2")).toBe("No manually entered price for BKMB yet.");
  });
});

describe("sweepAlerts — 10-minute throttle", () => {
  it("an alert checked moments ago is not due again", async () => {
    const instrument = makeInstrument("inst-3");
    const recentlyChecked = new Date(NOW.getTime() - 5 * 60 * 1000); // 5 minutes ago
    const { store } = makeFakeAlertStore([
      makeAlertRecord({
        id: "alert-3",
        kind: "PRICE_ABOVE",
        instrumentId: instrument.id,
        instrument,
        threshold: 100,
        lastEvaluatedAt: recentlyChecked,
      }),
    ]);
    const getQuoteFn = vi.fn(async () => okQuote(150));

    const summary = await sweepAlerts({ userId: USER_ID }, { store, getQuoteFn, now: NOW });

    expect(summary.due).toBe(0);
    expect(getQuoteFn).not.toHaveBeenCalled();
  });

  it("an alert checked over 10 minutes ago IS due again", async () => {
    const instrument = makeInstrument("inst-3b");
    const staleCheck = new Date(NOW.getTime() - ALERT_EVAL_MIN_INTERVAL_MS - 1000);
    const { store } = makeFakeAlertStore([
      makeAlertRecord({
        id: "alert-3b",
        kind: "PRICE_ABOVE",
        instrumentId: instrument.id,
        instrument,
        threshold: 100,
        lastEvaluatedAt: staleCheck,
      }),
    ]);
    const getQuoteFn = vi.fn(async () => okQuote(50));

    const summary = await sweepAlerts({ userId: USER_ID }, { store, getQuoteFn, now: NOW });

    expect(summary.due).toBe(1);
    expect(getQuoteFn).toHaveBeenCalledTimes(1);
  });
});

describe("sweepAlerts — instrument dedupe", () => {
  it("fetches the quote exactly once for two alerts on the same instrument", async () => {
    const instrument = makeInstrument("inst-4", "MSFT");
    const { store } = makeFakeAlertStore([
      makeAlertRecord({
        id: "alert-4a",
        kind: "PRICE_ABOVE",
        instrumentId: instrument.id,
        instrument,
        threshold: 100,
      }),
      makeAlertRecord({
        id: "alert-4b",
        kind: "PRICE_BELOW",
        instrumentId: instrument.id,
        instrument,
        threshold: 500,
      }),
    ]);
    const getQuoteFn = vi.fn(async () => okQuote(150));

    const summary = await sweepAlerts({ userId: USER_ID }, { store, getQuoteFn, now: NOW });

    expect(getQuoteFn).toHaveBeenCalledTimes(1);
    expect(summary.evaluated).toBe(2);
    expect(summary.fired).toBe(2); // 150 >= 100 (above) and 150 <= 500 (below) — both fire
  });
});

describe("createPrismaAlertStore().previousClose — never a seed-sourced baseline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queries PriceCache excluding source SEED, so a seed-only history reads as no previous close", async () => {
    // If the only PriceCache row on record for an instrument is the seeded
    // demo price (e.g. AAPL's sample row from prisma/seed.ts), the ALERT
    // GUARANTEE requires this to behave exactly like no previous close
    // exists — never fabricate a DAY_DROP baseline off sample data. Mocking
    // the Prisma call to return null models that outcome and asserts the
    // query itself carries the exclusion, so a regression that drops the
    // `source: { not: "SEED" }` filter fails this test.
    const findFirst = vi.spyOn(prisma.priceCache, "findFirst").mockResolvedValue(null);

    const store = createPrismaAlertStore();
    const result = await store.previousClose("inst-aapl", new Date("2026-07-19T12:00:00Z"));

    expect(result).toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: { not: "SEED" } }),
      }),
    );
  });
});

describe("sweepAlerts — per-sweep instrument cap", () => {
  it("evaluates at most ALERT_SWEEP_MAX_INSTRUMENTS distinct instruments, deferring the rest", async () => {
    const totalInstruments = ALERT_SWEEP_MAX_INSTRUMENTS + 1;
    const records = Array.from({ length: totalInstruments }, (_, i) => {
      const instrument = makeInstrument(`inst-cap-${i}`);
      return makeAlertRecord({
        id: `alert-cap-${i}`,
        kind: "PRICE_ABOVE",
        instrumentId: instrument.id,
        instrument,
        threshold: 100,
      });
    });
    const { store } = makeFakeAlertStore(records);
    const getQuoteFn = vi.fn(async () => okQuote(150));

    const summary = await sweepAlerts("all-users", { store, getQuoteFn, now: NOW });

    expect(getQuoteFn).toHaveBeenCalledTimes(ALERT_SWEEP_MAX_INSTRUMENTS);
    expect(summary.evaluated).toBe(ALERT_SWEEP_MAX_INSTRUMENTS);
    expect(summary.skippedInstruments).toBe(1);
  });
});

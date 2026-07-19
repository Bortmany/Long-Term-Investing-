// The alert-sweep engine (BUILD-PLAN.md Phase 7) — checks every due ACTIVE
// alert, fetching each instrument's quote at most once per sweep, and
// persists the result: a fired alert gets a Notification + flips to
// TRIGGERED; a checked-but-not-fired alert gets an honest lastOutcome. All
// dependencies are injectable so this is fully unit-testable without a real
// database (tests/unit/alert-engine.test.ts).
//
// GOLDEN RULE: the pure evaluators in ./evaluate.ts already refuse to fire on
// sample data; this engine additionally never fabricates a quote or a
// previous close — a fetch failure is recorded as an honest "not checked",
// never silently skipped and never guessed.

import type { AlertKind, Currency, PriceSource, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { rateLimit, userKey } from "@/lib/rate-limit";
import { getQuote, type DataResult, type InstrumentRef, type Quote, type SourceBadge } from "@/lib/data";
import {
  evaluatePriceAlert,
  evaluateThesisAlert,
  shouldRearmThesisAlert,
  type PriceAlertKind,
} from "./evaluate";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** An ACTIVE alert is "due" once this long has passed since it was last checked. */
export const ALERT_EVAL_MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/** Per-sweep cap on distinct instruments fetched — bounds one sweep's cost. */
export const ALERT_SWEEP_MAX_INSTRUMENTS = 25;

// ---------------------------------------------------------------------------
// Store port (injectable so unit tests need no database)
// ---------------------------------------------------------------------------

export type AlertSweepScope = { userId: string } | "all-users";

/** The plain data the engine needs about one alert — Decimal already converted to number. */
export type AlertRecord = {
  id: string;
  userId: string;
  kind: AlertKind;
  instrumentId: string | null;
  thesisId: string | null;
  threshold: number | null;
  intervalDays: number | null;
  lastEvaluatedAt: Date | null;
  lastTriggeredAt: Date | null;
  instrument: InstrumentRef | null;
  thesis: { id: string; createdAt: Date; instrument: { ticker: string } } | null;
};

export type RecordFirePriceInfo = {
  amount: number;
  currency: Currency;
  source: PriceSource;
  asOf: Date;
};

export type RecordFireParams = {
  alertId: string;
  userId: string;
  title: string;
  body: string;
  now: Date;
  /** Present for price-kind alerts (the golden-rule snapshot); absent for THESIS_REVIEW_DUE. */
  price?: RecordFirePriceInfo;
};

export interface AlertStore {
  /** ACTIVE alerts due for evaluation (lastEvaluatedAt null or older than minIntervalMs). */
  findDueAlerts(scope: AlertSweepScope, now: Date, minIntervalMs: number): Promise<AlertRecord[]>;
  /** TRIGGERED THESIS_REVIEW_DUE alerts, candidates for the auto re-arm pass. */
  findTriggeredThesisAlerts(scope: AlertSweepScope): Promise<AlertRecord[]>;
  /** The most recent ThesisCheck.createdAt for a thesis, or null if never checked. */
  latestThesisCheckAt(thesisId: string): Promise<Date | null>;
  /** Newest non-SEED PriceCache row for an instrument with asOf strictly before the quote's calendar day, or null (a seed-only history never counts as a real previous close). */
  previousClose(instrumentId: string, quoteAsOf: Date): Promise<{ price: number; asOf: Date } | null>;
  /** Record a checked-but-not-fired outcome. */
  recordNoFire(alertId: string, now: Date, outcome: string): Promise<void>;
  /** Record a fired alert: create the Notification + flip the alert to TRIGGERED, atomically. */
  recordFire(params: RecordFireParams): Promise<void>;
  /** Re-arm one TRIGGERED alert back to ACTIVE (thesis auto re-arm only). */
  rearmAlert(alertId: string, now: Date): Promise<void>;
}

type AlertWithRelations = Prisma.AlertGetPayload<{
  include: { instrument: true; thesis: { include: { instrument: true } } };
}>;

const ALERT_INCLUDE = {
  instrument: true,
  thesis: { include: { instrument: true } },
} as const;

function toAlertRecord(row: AlertWithRelations): AlertRecord {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    instrumentId: row.instrumentId,
    thesisId: row.thesisId,
    threshold: row.threshold === null ? null : row.threshold.toNumber(),
    intervalDays: row.intervalDays,
    lastEvaluatedAt: row.lastEvaluatedAt,
    lastTriggeredAt: row.lastTriggeredAt,
    instrument: row.instrument
      ? {
          id: row.instrument.id,
          ticker: row.instrument.ticker,
          market: row.instrument.market,
          currency: row.instrument.currency,
        }
      : null,
    thesis: row.thesis
      ? {
          id: row.thesis.id,
          createdAt: row.thesis.createdAt,
          instrument: { ticker: row.thesis.instrument.ticker },
        }
      : null,
  };
}

function scopeWhere(scope: AlertSweepScope): Prisma.AlertWhereInput {
  return scope === "all-users" ? {} : { userId: scope.userId };
}

export function createPrismaAlertStore(): AlertStore {
  return {
    async findDueAlerts(scope, now, minIntervalMs) {
      const cutoff = new Date(now.getTime() - minIntervalMs);
      const rows = await prisma.alert.findMany({
        where: {
          status: "ACTIVE",
          ...scopeWhere(scope),
          OR: [{ lastEvaluatedAt: null }, { lastEvaluatedAt: { lt: cutoff } }],
        },
        include: ALERT_INCLUDE,
        // Least-recently-checked first (never-checked at the very front), so
        // the per-sweep instrument cap rotates fairly instead of always
        // serving the same front-of-list alerts.
        orderBy: { lastEvaluatedAt: { sort: "asc", nulls: "first" } },
      });
      return rows.map(toAlertRecord);
    },

    async findTriggeredThesisAlerts(scope) {
      const rows = await prisma.alert.findMany({
        where: { status: "TRIGGERED", kind: "THESIS_REVIEW_DUE", ...scopeWhere(scope) },
        include: ALERT_INCLUDE,
      });
      return rows.map(toAlertRecord);
    },

    async latestThesisCheckAt(thesisId) {
      const row = await prisma.thesisCheck.findFirst({
        where: { thesisId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      return row?.createdAt ?? null;
    },

    async previousClose(instrumentId, quoteAsOf) {
      // "The quote's calendar day" — computed in UTC so this is stable
      // regardless of server timezone.
      const startOfQuoteDay = new Date(
        Date.UTC(quoteAsOf.getUTCFullYear(), quoteAsOf.getUTCMonth(), quoteAsOf.getUTCDate()),
      );
      // GOLDEN RULE: never let a seeded sample row stand in for a real
      // previous close — a SEED-sourced row here would let a live DAY_DROP
      // alert fire (or compute its drop %) off a fabricated baseline price.
      // If the only prior row on record is SEED, this returns null and
      // evaluatePriceAlert reports the honest "no previous closing price".
      const row = await prisma.priceCache.findFirst({
        where: { instrumentId, asOf: { lt: startOfQuoteDay }, source: { not: "SEED" } },
        orderBy: { asOf: "desc" },
      });
      return row ? { price: row.price.toNumber(), asOf: row.asOf } : null;
    },

    async recordNoFire(alertId, now, outcome) {
      await prisma.alert.update({
        where: { id: alertId },
        data: { lastEvaluatedAt: now, lastOutcome: outcome },
      });
    },

    async recordFire({ alertId, userId, title, body, now, price }) {
      await prisma.$transaction([
        prisma.notification.create({
          data: {
            userId,
            alertId,
            title,
            body,
            ...(price
              ? {
                  priceAtTrigger: price.amount,
                  priceCurrency: price.currency,
                  priceSource: price.source,
                  priceAsOf: price.asOf,
                }
              : {}),
          },
        }),
        prisma.alert.update({
          where: { id: alertId },
          data: { status: "TRIGGERED", lastTriggeredAt: now, lastEvaluatedAt: now, lastOutcome: title },
        }),
      ]);
    },

    async rearmAlert(alertId, now) {
      void now;
      await prisma.alert.update({
        where: { id: alertId },
        data: {
          status: "ACTIVE",
          // Re-armed alerts are due right away rather than waiting out the
          // last evaluation's cooldown.
          lastEvaluatedAt: null,
          lastOutcome: "Automatically checked again after a newer thesis check.",
        },
      });
    },
  };
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

export type SweepAlertsSummary = {
  due: number;
  evaluated: number;
  fired: number;
  skippedInstruments: number;
  thesisAlertsRearmed: number;
};

export type SweepAlertsDeps = {
  store?: AlertStore;
  getQuoteFn?: typeof getQuote;
  now?: Date;
};

function isPriceKind(kind: AlertKind): kind is PriceAlertKind {
  return kind !== "THESIS_REVIEW_DUE";
}

/** The reverse of src/lib/data's badgeForPriceSource — only ever called with "live"/"manual" (see the guarantee in ./evaluate.ts). */
function priceSourceFromBadge(source: SourceBadge): PriceSource {
  switch (source) {
    case "live":
      return "FMP";
    case "manual":
      return "MANUAL";
    case "sample":
      return "SEED";
  }
}

/**
 * Sweep every due ACTIVE alert in `scope` ("all-users" for the cron route, or
 * one user for the session-activity trigger). Manual instruments cost
 * nothing extra to check (their "fetch" just reads PriceCache); FMP-routed
 * instruments still go through the normal 15-minute quote cache, so a sweep
 * never bypasses the rate-limiting that cache already provides.
 */
export async function sweepAlerts(
  scope: AlertSweepScope,
  deps: SweepAlertsDeps = {},
): Promise<SweepAlertsSummary> {
  const store = deps.store ?? createPrismaAlertStore();
  const getQuoteFn = deps.getQuoteFn ?? getQuote;
  const now = deps.now ?? new Date();

  const dueAlerts = await store.findDueAlerts(scope, now, ALERT_EVAL_MIN_INTERVAL_MS);
  const priceAlerts = dueAlerts.filter(
    (a): a is AlertRecord & { instrumentId: string; instrument: InstrumentRef } =>
      isPriceKind(a.kind) && a.instrumentId !== null && a.instrument !== null,
  );
  const thesisAlerts = dueAlerts.filter(
    (a): a is AlertRecord & { thesisId: string; thesis: NonNullable<AlertRecord["thesis"]> } =>
      a.kind === "THESIS_REVIEW_DUE" && a.thesisId !== null && a.thesis !== null,
  );

  // Dedupe instruments so each quote is fetched exactly once per sweep, and
  // cap how many distinct instruments a single sweep will fetch — a very
  // large alert list, or a misfiring schedule, can't run away. Anything past
  // the cap is simply left due for the next sweep, never dropped.
  const instrumentIds = [...new Set(priceAlerts.map((a) => a.instrumentId))];
  const activeInstrumentIds = new Set(instrumentIds.slice(0, ALERT_SWEEP_MAX_INSTRUMENTS));
  const skippedInstrumentCount = instrumentIds.length - activeInstrumentIds.size;
  if (skippedInstrumentCount > 0) {
    logger.warn(
      "Alert sweep hit the per-sweep instrument cap; some instruments were deferred to the next sweep",
      { skippedInstrumentCount, cap: ALERT_SWEEP_MAX_INSTRUMENTS },
    );
  }

  const quoteByInstrument = new Map<string, DataResult<Quote>>();
  const previousCloseByInstrument = new Map<string, { price: number; asOf: Date } | null>();

  for (const instrumentId of activeInstrumentIds) {
    const oneAlertForThisInstrument = priceAlerts.find((a) => a.instrumentId === instrumentId)!;
    const quote = await getQuoteFn(oneAlertForThisInstrument.instrument);
    quoteByInstrument.set(instrumentId, quote);
    if (quote.ok) {
      const needsPreviousClose = priceAlerts.some(
        (a) => a.instrumentId === instrumentId && a.kind === "DAY_DROP",
      );
      if (needsPreviousClose) {
        previousCloseByInstrument.set(instrumentId, await store.previousClose(instrumentId, quote.data.asOf));
      }
    }
  }

  let evaluated = 0;
  let fired = 0;

  for (const alert of priceAlerts) {
    if (!activeInstrumentIds.has(alert.instrumentId)) continue; // deferred by the cap
    evaluated += 1;

    const quoteResult = quoteByInstrument.get(alert.instrumentId);
    if (!quoteResult || !quoteResult.ok) {
      await store.recordNoFire(
        alert.id,
        now,
        quoteResult?.message ?? "Not checked — this stock's price is currently unavailable.",
      );
      continue;
    }

    const result = evaluatePriceAlert(
      { kind: alert.kind as PriceAlertKind, threshold: alert.threshold ?? 0, ticker: alert.instrument.ticker },
      { quote: quoteResult.data, previousClose: previousCloseByInstrument.get(alert.instrumentId) ?? null },
      now,
    );

    if (result.fired) {
      fired += 1;
      await store.recordFire({
        alertId: alert.id,
        userId: alert.userId,
        title: result.title,
        body: result.body,
        now,
        price: {
          amount: quoteResult.data.price,
          currency: quoteResult.data.currency,
          source: priceSourceFromBadge(quoteResult.data.source),
          asOf: quoteResult.data.asOf,
        },
      });
    } else {
      await store.recordNoFire(alert.id, now, result.outcome);
    }
  }

  for (const alert of thesisAlerts) {
    evaluated += 1;
    const lastCheckedAt = await store.latestThesisCheckAt(alert.thesisId);
    const result = evaluateThesisAlert(
      { intervalDays: alert.intervalDays ?? 0, ticker: alert.thesis.instrument.ticker },
      { lastCheckedAt, thesisCreatedAt: alert.thesis.createdAt },
      now,
    );

    if (result.fired) {
      fired += 1;
      await store.recordFire({ alertId: alert.id, userId: alert.userId, title: result.title, body: result.body, now });
    } else {
      await store.recordNoFire(alert.id, now, result.outcome);
    }
  }

  // TRIGGERED THESIS_REVIEW_DUE alerts auto re-arm once a newer ThesisCheck
  // exists — the owner acted on the alert, so it goes back to watching for
  // the NEXT interval rather than sitting stuck at TRIGGERED forever. Price
  // alerts never auto re-arm; only the owner re-arms those, by hand.
  const triggeredThesisAlerts = await store.findTriggeredThesisAlerts(scope);
  let thesisAlertsRearmed = 0;
  for (const alert of triggeredThesisAlerts) {
    if (!alert.thesisId) continue;
    const lastCheckAt = await store.latestThesisCheckAt(alert.thesisId);
    if (shouldRearmThesisAlert({ lastTriggeredAt: alert.lastTriggeredAt }, lastCheckAt)) {
      await store.rearmAlert(alert.id, now);
      thesisAlertsRearmed += 1;
    }
  }

  return {
    due: dueAlerts.length,
    evaluated,
    fired,
    skippedInstruments: skippedInstrumentCount,
    thesisAlertsRearmed,
  };
}

// ---------------------------------------------------------------------------
// Session-activity trigger
// ---------------------------------------------------------------------------

/** At most one sweep per user per cooldown window, counted in-process. */
const SESSION_SWEEP_RATE_LIMIT = { limit: 1, windowMs: ALERT_EVAL_MIN_INTERVAL_MS };

/**
 * Sweep one user's alerts from a page load (src/app/(app)/layout.tsx's
 * after()). Throttled to at most once per ALERT_EVAL_MIN_INTERVAL_MS per
 * user so browsing the app doesn't re-check alerts on every navigation, and
 * hardened so a background sweep can NEVER break a page render: it never
 * throws (a failure is logged and swallowed) and it never calls
 * revalidatePath (that's for the mutating server actions in
 * src/app/actions/alerts.ts, not this fire-and-forget background task).
 */
export async function sweepAlertsForUserThrottled(userId: string): Promise<void> {
  const limited = rateLimit(userKey("alert-sweep", userId), SESSION_SWEEP_RATE_LIMIT);
  if (!limited.ok) return;

  try {
    await sweepAlerts({ userId });
  } catch (error) {
    logger.warn("Session-triggered alert sweep failed for one user", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

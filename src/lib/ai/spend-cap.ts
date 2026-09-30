// The AI spending limits (go-public spec B2) — the lid on the owner's
// Anthropic bill.
//
// UNIT OF SPEND: one persisted `AiAnalysis` row = one unit — NOT one
// Anthropic API call. A Committee run makes 6 persona calls + 1 synthesis
// call but saves exactly ONE row, so it costs 1 unit, same as a Health Score.
// Reusing a stored analysis by input hash never reaches this file at all.
//
// THE CHECKS, in this order (first one that fails wins):
//   1. App-wide: new analyses today (UTC) across ALL users must be below
//      GLOBAL_AI_DAILY_CAP (default 100; 0 = AI paused for everyone).
//   2. Per-user daily: 2 on Free, 10 on Pro (src/lib/plans.ts).
//   3. Per-user monthly, Pro only: 150 per UTC calendar month.
//
// NO BYPASS BY RUSHING: generations that are still running in this server
// process count as if they were already saved (an in-memory "reservation"
// per user plus one app-wide), so five simultaneous clicks from a Free user
// with nothing used today let exactly two through. A reservation is released
// when its run ends — saved or failed. Same per-process scaling seam as the
// rate limiter (src/lib/rate-limit.ts): a shared store can replace the
// in-memory one behind `AiReservationStore` without any caller changing.
//
// The Plans card in Settings reads its usage numbers from `readAiUsage`
// below — the SAME function the checks use — so the card can never disagree
// with what actually gets enforced.

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isBillingEnabled } from "@/lib/billing/config";
import { getUserPlan } from "@/lib/plan-access";
import { PLAN_LIMITS, type PlanName } from "@/lib/plans";
import {
  aiLimitCodeFor,
  aiLimitMessageFor,
  aiLimitUpgradeHref,
  type AiLimitCode,
  type SpendCapReason,
} from "@/lib/ai/limit-messages";

export type { SpendCapReason } from "@/lib/ai/limit-messages";

// ---------------------------------------------------------------------------
// Time boundaries (all UTC)
// ---------------------------------------------------------------------------

/** Midnight UTC on the day containing `now` — the daily limits reset here. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Midnight UTC on the next day — when today's limits reset. */
export function startOfNextUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/** Midnight UTC on the 1st of the month containing `now`. */
export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Midnight UTC on the 1st of next month — when the monthly limit resets. */
export function startOfNextUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

// ---------------------------------------------------------------------------
// The app-wide cap (GLOBAL_AI_DAILY_CAP)
// ---------------------------------------------------------------------------

export const DEFAULT_GLOBAL_AI_DAILY_CAP = 100;

let warnedInvalidGlobalCap = false;

/**
 * The app-wide daily number. Unset or blank → 100 (never "unlimited");
 * "0" → AI paused for everyone (an emergency stop); anything that isn't a
 * whole number → 100 plus ONE warning in the logs.
 */
export function parseGlobalAiDailyCap(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.GLOBAL_AI_DAILY_CAP;
  if (raw === undefined || raw.trim() === "") return DEFAULT_GLOBAL_AI_DAILY_CAP;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (!warnedInvalidGlobalCap) {
    warnedInvalidGlobalCap = true;
    logger.warn(
      `GLOBAL_AI_DAILY_CAP is not a whole number; using the default of ${DEFAULT_GLOBAL_AI_DAILY_CAP}.`,
    );
  }
  return DEFAULT_GLOBAL_AI_DAILY_CAP;
}

// ---------------------------------------------------------------------------
// In-flight reservations (the "no bypass by rushing" guard)
// ---------------------------------------------------------------------------

/** The seam a shared (e.g. Redis) store would implement later. */
export interface AiReservationStore {
  /** How many live reservations `key` holds right now. */
  count(key: string): number;
  /** Add one reservation under `key`; returns its id. */
  add(key: string): string;
  /** Remove one reservation (no-op if already gone). */
  remove(key: string, id: string): void;
}

// A reservation that somehow never gets released (a bug, a hung request)
// expires on its own so it can't block a user forever.
const RESERVATION_TTL_MS = 10 * 60 * 1000;

class MemoryAiReservationStore implements AiReservationStore {
  private entries: Map<string, Map<string, number>>;

  constructor(entries?: Map<string, Map<string, number>>) {
    this.entries = entries ?? new Map();
  }

  private live(key: string): Map<string, number> | undefined {
    const bucket = this.entries.get(key);
    if (!bucket) return undefined;
    const now = Date.now();
    for (const [id, expiresAt] of bucket) {
      if (expiresAt <= now) bucket.delete(id);
    }
    if (bucket.size === 0) {
      this.entries.delete(key);
      return undefined;
    }
    return bucket;
  }

  count(key: string): number {
    return this.live(key)?.size ?? 0;
  }

  add(key: string): string {
    const id = randomUUID();
    const bucket = this.live(key) ?? new Map<string, number>();
    bucket.set(id, Date.now() + RESERVATION_TTL_MS);
    this.entries.set(key, bucket);
    return id;
  }

  remove(key: string, id: string): void {
    const bucket = this.entries.get(key);
    if (!bucket) return;
    bucket.delete(id);
    if (bucket.size === 0) this.entries.delete(key);
  }
}

/** A fresh, empty in-memory store — tests use one each so they never share state. */
export function createMemoryAiReservationStore(): AiReservationStore {
  return new MemoryAiReservationStore();
}

// Guarded on globalThis so a dev hot-reload doesn't forget runs in flight.
const globalRef = globalThis as typeof globalThis & {
  __investiqAiReservations?: Map<string, Map<string, number>>;
};
globalRef.__investiqAiReservations ??= new Map();
const defaultReservations: AiReservationStore = new MemoryAiReservationStore(
  globalRef.__investiqAiReservations,
);

const GLOBAL_RESERVATION_KEY = "ai-inflight:global";
const userReservationKey = (userId: string) => `ai-inflight:user:${userId}`;

// ---------------------------------------------------------------------------
// Usage — ONE reader for both the cap and the Plans card
// ---------------------------------------------------------------------------

export type SpendCapDeps = {
  /** Number of AiAnalysis rows this user has created since `since`. */
  countSince: (userId: string, since: Date) => Promise<number>;
  /** Number of AiAnalysis rows created by ALL users since `since`. */
  countAllSince?: (since: Date) => Promise<number>;
  /** The plan the app treats this user as right now. */
  getPlan?: (userId: string, now: Date) => Promise<PlanName>;
  /** Where in-flight runs are counted. */
  reservations?: AiReservationStore;
  /** Environment to read GLOBAL_AI_DAILY_CAP and the billing switch from. */
  env?: Record<string, string | undefined>;
};

const defaultDeps: Required<SpendCapDeps> = {
  countSince: (userId, since) =>
    prisma.aiAnalysis.count({ where: { userId, createdAt: { gte: since } } }),
  countAllSince: (since) => prisma.aiAnalysis.count({ where: { createdAt: { gte: since } } }),
  getPlan: (userId, now) => getUserPlan(userId, now),
  reservations: defaultReservations,
  env: process.env,
};

function withDefaults(deps: SpendCapDeps | undefined): Required<SpendCapDeps> {
  return { ...defaultDeps, ...(deps ?? {}) } as Required<SpendCapDeps>;
}

export type AiUsage = {
  plan: PlanName;
  /** New analyses this user saved today (UTC). */
  usedToday: number;
  dailyLimit: number;
  /** Pro only: new analyses this user saved this UTC month. Null on Free (no monthly limit). */
  usedThisMonth: number | null;
  monthlyLimit: number | null;
  /** New analyses saved today (UTC) across all users. */
  globalUsedToday: number;
  globalLimit: number;
};

/**
 * Read this user's saved-analysis usage and limits. The spend cap below and
 * the Settings Plans card both call this — one source for both. Throws if
 * the database can't be read (the card then shows its error state; it never
 * guesses a number).
 */
export async function readAiUsage(
  userId: string,
  deps?: SpendCapDeps,
  now: Date = new Date(),
): Promise<AiUsage> {
  const d = withDefaults(deps);
  const plan = await d.getPlan(userId, now);
  const [globalUsedToday, usedToday, usedThisMonth] = await Promise.all([
    d.countAllSince(startOfUtcDay(now)),
    d.countSince(userId, startOfUtcDay(now)),
    plan === "PRO" ? d.countSince(userId, startOfUtcMonth(now)) : Promise.resolve(null),
  ]);
  return {
    plan,
    usedToday,
    dailyLimit: PLAN_LIMITS[plan].dailyAi,
    usedThisMonth,
    monthlyLimit: plan === "PRO" ? PLAN_LIMITS.PRO.monthlyAi : null,
    globalUsedToday,
    globalLimit: parseGlobalAiDailyCap(d.env),
  };
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

export type SpendCapRefusal = {
  ok: false;
  message: string;
  reason: SpendCapReason;
  plan: PlanName;
  resetsAt: Date;
  code: AiLimitCode;
  /** Only set when an upgrade is genuinely on offer (Free daily, billing on). */
  upgradeHref?: string;
};

export type SpendCapResult =
  | {
      ok: true;
      remaining: number;
      /**
       * Give back this run's in-flight reservation. Call it once the run has
       * ended — saved or failed. Safe to call more than once.
       */
      release?: () => void;
    }
  | SpendCapRefusal;

function refuse(
  reason: SpendCapReason,
  plan: PlanName,
  now: Date,
  billingOn: boolean,
): SpendCapRefusal {
  const refusal: SpendCapRefusal = {
    ok: false,
    message: aiLimitMessageFor(reason, plan, billingOn),
    reason,
    plan,
    resetsAt: reason === "user_monthly" ? startOfNextUtcMonth(now) : startOfNextUtcDay(now),
    code: aiLimitCodeFor(reason, plan),
  };
  const upgradeHref = aiLimitUpgradeHref(reason, plan, billingOn);
  if (upgradeHref) refusal.upgradeHref = upgradeHref;
  return refusal;
}

/**
 * Whether `userId` may generate one more NEW AI analysis right now. On "yes"
 * it also reserves a slot, which the caller must `release()` when the run
 * ends. Reusing a stored analysis by input hash never calls this.
 */
export async function checkAiSpendCap(
  userId: string,
  deps?: SpendCapDeps,
  now: Date = new Date(),
): Promise<SpendCapResult> {
  const d = withDefaults(deps);
  const usage = await readAiUsage(userId, d, now);
  const billingOn = isBillingEnabled(d.env);

  // Everything from here to the reservation is synchronous, so no other
  // request in this process can slip in between the check and the reserve.
  const userKey = userReservationKey(userId);
  const globalInFlight = d.reservations.count(GLOBAL_RESERVATION_KEY);
  const userInFlight = d.reservations.count(userKey);

  if (usage.globalUsedToday + globalInFlight >= usage.globalLimit) {
    return refuse("global_daily", usage.plan, now, billingOn);
  }
  if (usage.usedToday + userInFlight >= usage.dailyLimit) {
    return refuse("user_daily", usage.plan, now, billingOn);
  }
  if (
    usage.plan === "PRO" &&
    usage.monthlyLimit !== null &&
    (usage.usedThisMonth ?? 0) + userInFlight >= usage.monthlyLimit
  ) {
    return refuse("user_monthly", usage.plan, now, billingOn);
  }

  const globalId = d.reservations.add(GLOBAL_RESERVATION_KEY);
  const userReservationId = d.reservations.add(userKey);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    d.reservations.remove(GLOBAL_RESERVATION_KEY, globalId);
    d.reservations.remove(userKey, userReservationId);
  };

  return {
    ok: true,
    remaining: usage.dailyLimit - usage.usedToday - userInFlight - 1,
    release,
  };
}

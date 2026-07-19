// In-memory, per-process rate limiter (engineering-standards §2).
//
// TWO KEYS: the CALLER builds the key from the visitor's IP (anonymous
// traffic, e.g. sign-in) OR from the signed-in user's id (logged-in writes).
// Use the `ipKey` / `userKey` helpers so keys stay consistent.
//
// SCALING SEAM (REDIS_URL): counters live in this one server process, so
// limits are PER PROCESS — correct and fine for a single instance. When the
// app is scaled to several instances, set REDIS_URL and drop in a Redis-backed
// store behind the same `RateLimitStore` interface below; no caller changes.
// We deliberately add NO redis dependency until that day.

export type RateLimitOptions = { limit: number; windowMs: number };

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

type Bucket = { count: number; resetAt: number };

/** The seam a future Redis store implements — swap it in without caller edits. */
interface RateLimitStore {
  hit(key: string, windowMs: number): Bucket;
}

// In-memory fixed-window store. Guarded on globalThis so Next.js dev
// hot-reloads (which re-run modules) don't wipe every visitor's counter.
class MemoryRateLimitStore implements RateLimitStore {
  private buckets: Map<string, Bucket>;

  constructor() {
    const globalRef = globalThis as typeof globalThis & {
      __investiqRateLimitBuckets?: Map<string, Bucket>;
    };
    globalRef.__investiqRateLimitBuckets ??= new Map();
    this.buckets = globalRef.__investiqRateLimitBuckets;
  }

  hit(key: string, windowMs: number): Bucket {
    const now = Date.now();
    const existing = this.buckets.get(key);

    // Start a fresh window when there is none or the old one has expired.
    if (!existing || existing.resetAt <= now) {
      const fresh: Bucket = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      return fresh;
    }

    existing.count += 1;

    // Opportunistic cleanup so the Map can't grow without bound over time.
    if (this.buckets.size > 10_000) {
      for (const [bucketKey, bucket] of this.buckets) {
        if (bucket.resetAt <= now) this.buckets.delete(bucketKey);
      }
    }
    return existing;
  }
}

if (process.env.REDIS_URL) {
  // Seam only: a shared Redis store is not wired yet (no redis dependency by
  // design). Keep using the in-memory limiter, but say so once so an operator
  // who set REDIS_URL isn't surprised that limits are still per-process.
  console.warn(
    JSON.stringify({
      level: "warn",
      time: new Date().toISOString(),
      message:
        "REDIS_URL is set but the shared rate-limit store is not wired yet; using the per-process in-memory limiter.",
    }),
  );
}

const store: RateLimitStore = new MemoryRateLimitStore();

/**
 * Count one hit against `key` and say whether it is allowed. Fixed window:
 * up to `limit` hits per `windowMs`, then denied until the window resets.
 */
export function rateLimit(
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  const bucket = store.hit(key, options.windowMs);
  if (bucket.count > options.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - Date.now()) / 1000),
    );
    return { ok: false, retryAfterSeconds };
  }
  return { ok: true, remaining: Math.max(0, options.limit - bucket.count) };
}

/**
 * The visitor's IP for anonymous rate limiting. Behind a proxy (Railway) the
 * real client is the FIRST hop of `x-forwarded-for`; fall back to `x-real-ip`,
 * then a constant so header-less traffic still shares one bucket.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function ipKey(scope: string, ip: string): string {
  return `${scope}:ip:${ip}`;
}

export function userKey(scope: string, userId: string): string {
  return `${scope}:user:${userId}`;
}

/** Plain-English message for a denied request (owner is not a developer). */
export function rateLimitMessage(retryAfterSeconds: number): string {
  const seconds = Math.max(1, retryAfterSeconds);
  return `Too many requests. Please wait about ${seconds} second${
    seconds === 1 ? "" : "s"
  } and try again.`;
}

// Shared limits so every caller uses the same numbers.
export const AUTH_RATE_LIMIT: RateLimitOptions = { limit: 10, windowMs: 60_000 };
export const WRITE_ACTION_RATE_LIMIT: RateLimitOptions = {
  limit: 30,
  windowMs: 60_000,
};
export const IMPORT_RATE_LIMIT: RateLimitOptions = { limit: 10, windowMs: 60_000 };
// Actions that call the external market-data service (FMP) get a tighter
// per-user limit than plain database writes, so one user can't burn through
// the API allowance.
export const EXTERNAL_LOOKUP_RATE_LIMIT: RateLimitOptions = {
  limit: 10,
  windowMs: 60_000,
};
// AI analysis generation (Health Score, Committee, etc.) calls a paid model
// API. This is a burst guard, separate from and in addition to the daily
// per-user $ cap in src/lib/ai/spend-cap.ts (DAILY_AI_ANALYSIS_LIMIT) — this
// one stops rapid double-clicks/retries within a minute; the spend cap stops
// the day's total cost.
export const AI_GENERATION_RATE_LIMIT: RateLimitOptions = {
  limit: 5,
  windowMs: 60_000,
};

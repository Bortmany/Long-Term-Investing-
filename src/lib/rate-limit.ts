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

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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
 * Whether to trust the `x-forwarded-for` / `x-real-ip` headers for the client
 * IP. These headers are trivially spoofable by the caller, so an attacker
 * could set a fresh value per request and get a fresh rate-limit bucket every
 * time — defeating an IP-based limit. Only trust them when the app is actually
 * behind a proxy you control that overwrites them (Railway, a load balancer),
 * which the operator signals by setting TRUST_PROXY_HEADERS="true".
 * Default: DON'T trust — safer, and combined with the per-account limiter it
 * still stops brute force.
 */
export function shouldTrustProxyHeaders(): boolean {
  return process.env.TRUST_PROXY_HEADERS === "true";
}

/**
 * The visitor's IP for anonymous rate limiting. Only reads the forwarding
 * headers when the operator has declared the proxy trusted (see above);
 * otherwise every header-only visitor shares the "unknown" bucket, so a
 * spoofed `x-forwarded-for` can't win a fresh bucket. Real client-address
 * routing would require the platform's connection info (not available from a
 * Web `Request`); until then the per-account key below is the real defense.
 */
export function getClientIp(
  headers: Headers,
  options?: { trustProxyHeaders?: boolean },
): string {
  const trust = options?.trustProxyHeaders ?? shouldTrustProxyHeaders();
  if (!trust) return "unknown";

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

// ---------------------------------------------------------------------------
// Per-browser anonymous id (used when the proxy headers are NOT trusted).
//
// With TRUST_PROXY_HEADERS off (the default) we can't read a real client IP,
// so without this every anonymous visitor would share one "unknown" bucket and
// a handful of requests would lock sign-in for the whole app. Instead each
// browser gets a random id kept in a signed, httpOnly cookie: the signature
// (HMAC with BETTER_AUTH_SECRET) means the client can't forge or reuse someone
// else's id to raid their bucket, and it carries NO personal data (just a
// random token). The cookie plumbing lives in src/lib/anon-rate-id.ts; the
// pure sign/verify/mint helpers live here so they're unit-testable.
// ---------------------------------------------------------------------------

/** The httpOnly cookie name that stores the signed per-browser anon id. */
export const ANON_ID_COOKIE = "iq_anon";

/**
 * The key HMAC-signing uses. BETTER_AUTH_SECRET is required in production (the
 * app refuses to start without it — see src/instrumentation.ts); the
 * dev-only fallback just keeps `npm run dev`/tests working without one and is
 * never used to protect anything real.
 */
function anonSigningSecret(): string {
  return process.env.BETTER_AUTH_SECRET || "dev-only-insecure-anon-id-secret";
}

/** A fresh, unguessable per-browser id (never derived from anything personal). */
export function mintAnonId(): string {
  return randomBytes(16).toString("hex");
}

/** Sign an anon id as `<id>.<hmac>` for storing in the cookie. */
export function signAnonId(id: string): string {
  const sig = createHmac("sha256", anonSigningSecret()).update(id).digest("hex");
  return `${id}.${sig}`;
}

/**
 * Verify a signed cookie value and return the id inside it, or null when the
 * value is missing, malformed, or the signature doesn't match (tampered).
 */
export function verifyAnonId(value: string | undefined | null): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;

  const id = value.slice(0, dot);
  const providedSig = value.slice(dot + 1);
  const expectedSig = createHmac("sha256", anonSigningSecret())
    .update(id)
    .digest("hex");

  const provided = Buffer.from(providedSig);
  const expected = Buffer.from(expectedSig);
  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? id : null;
}

export function userKey(scope: string, userId: string): string {
  return `${scope}:user:${userId}`;
}

/**
 * A per-account rate-limit key (e.g. sign-in attempts against ONE email).
 * Lower-cased so casing can't split the bucket. This limits brute force
 * against a single account regardless of how many IPs (real or spoofed) the
 * attacker rotates through.
 */
export function emailKey(scope: string, email: string): string {
  return `${scope}:email:${email.trim().toLowerCase()}`;
}

/**
 * A per-token rate-limit key (e.g. password-reset attempts against ONE reset
 * token). Case-sensitive (tokens are). Bounds guessing/replay against a single
 * reset link no matter how many browsers or IPs the attempts come from — the
 * token equivalent of `emailKey`.
 */
export function tokenKey(scope: string, token: string): string {
  return `${scope}:token:${token.trim()}`;
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
// "Download my data" builds a full JSON export of everything the app stores
// about one user — a heavier read than any other endpoint. 5/hour is
// generous for a person checking their own data, tight enough to stop a
// scripted loop from hammering the database with full-account reads.
export const EXPORT_RATE_LIMIT: RateLimitOptions = { limit: 5, windowMs: 60 * 60_000 };

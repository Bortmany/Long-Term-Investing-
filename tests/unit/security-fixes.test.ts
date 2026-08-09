import { describe, expect, it } from "vitest";

import { computeHoldings } from "@/lib/portfolio/holdings";
import type { TxnInput } from "@/lib/portfolio/types";
import { transactionInputSchema, MONEY_MAX } from "@/lib/transaction-schema";
import { alertInputSchema } from "@/lib/alert-schema";
import {
  AUTH_RATE_LIMIT,
  emailKey,
  getClientIp,
  ipKey,
  mintAnonId,
  peekRateLimit,
  rateLimit,
  resetRateLimit,
  signAnonId,
  tokenKey,
  verifyAnonId,
  type RateLimitResult,
} from "@/lib/rate-limit";
import {
  applyOversellProjection,
  findImportOversell,
  type ImportRowResult,
  type ImportValidationReport,
} from "@/lib/import-rows";
import type { TransactionInput } from "@/lib/transaction-schema";
import { isSameOrigin } from "@/lib/request-origin";
import { isActionBodyDecodable } from "@/lib/action-body";

// ---------------------------------------------------------------------------
// Finding 3 — holdings computation is deterministic on same-day ties, so the
// Dashboard and Portfolio pages (which query in different orders) always agree.
// ---------------------------------------------------------------------------
describe("computeHoldings determinism (finding 3)", () => {
  const day = new Date("2026-01-10");
  // Three trades on the SAME day whose result depends on processing order:
  // a BUY, then a SELL, then another BUY at a different price. The stable
  // tie-break is createdAt (then id), so the outcome must NOT depend on the
  // order the database happened to return the rows in.
  const rows: TxnInput[] = [
    { type: "BUY", instrumentId: "x", quantity: 10, pricePerUnit: 200, amount: 2000, currency: "USD", fee: 0, tradeDate: day, id: "a", createdAt: new Date("2026-01-10T09:00:00Z") },
    { type: "SELL", instrumentId: "x", quantity: 5, pricePerUnit: 210, amount: 1050, currency: "USD", fee: 0, tradeDate: day, id: "b", createdAt: new Date("2026-01-10T10:00:00Z") },
    { type: "BUY", instrumentId: "x", quantity: 10, pricePerUnit: 220, amount: 2200, currency: "USD", fee: 0, tradeDate: day, id: "c", createdAt: new Date("2026-01-10T11:00:00Z") },
  ];

  it("gives the same holding no matter the input order", () => {
    const forward = computeHoldings(rows)[0];
    const reversed = computeHoldings([...rows].reverse())[0];
    const shuffled = computeHoldings([rows[1], rows[2], rows[0]])[0];

    expect(reversed.quantity).toBeCloseTo(forward.quantity, 8);
    expect(reversed.costBasis).toBeCloseTo(forward.costBasis, 8);
    expect(shuffled.costBasis).toBeCloseTo(forward.costBasis, 8);
  });

  it("processes in createdAt order (buy, sell, buy)", () => {
    const holding = computeHoldings([...rows].reverse())[0];
    // a: buy 10@200 (cost 2000) → b: sell 5 at avg 200 (cost 1000, qty 5) →
    // c: buy 10@220 (cost +2200) ⇒ qty 15, cost 3200.
    expect(holding.quantity).toBeCloseTo(15, 8);
    expect(holding.costBasis).toBeCloseTo(3200, 8);
  });
});

// ---------------------------------------------------------------------------
// Finding 4 — huge numbers get a clean 400 (schema rejection), never a 500
// from a Postgres numeric overflow.
// ---------------------------------------------------------------------------
describe("numeric bounds (finding 4)", () => {
  const base = { currency: "USD", tradeDate: "2026-01-10" } as const;

  it("rejects an absurd quantity", () => {
    const parsed = transactionInputSchema.safeParse({
      type: "BUY",
      instrumentId: "x",
      quantity: 1e30,
      pricePerUnit: 5,
      ...base,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an absurd price, amount and fee", () => {
    expect(
      transactionInputSchema.safeParse({ type: "BUY", instrumentId: "x", quantity: 1, pricePerUnit: 1e30, ...base }).success,
    ).toBe(false);
    expect(
      transactionInputSchema.safeParse({ type: "DEPOSIT", amount: 1e30, ...base }).success,
    ).toBe(false);
    expect(
      transactionInputSchema.safeParse({ type: "BUY", instrumentId: "x", quantity: 1, pricePerUnit: 5, fee: 1e30, ...base }).success,
    ).toBe(false);
  });

  it("still accepts a large-but-sane value at the cap", () => {
    const parsed = transactionInputSchema.safeParse({
      type: "DEPOSIT",
      amount: MONEY_MAX,
      ...base,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an absurd alert price threshold", () => {
    const parsed = alertInputSchema.safeParse({
      kind: "PRICE_ABOVE",
      instrumentId: "x",
      threshold: 1e30,
    });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Finding 6 — the auth limiter's IP source ignores spoofable forwarding
// headers unless a trusted proxy is configured, and there is a per-account key.
// ---------------------------------------------------------------------------
describe("rate-limit IP trust + per-account key (finding 6)", () => {
  it("ignores x-forwarded-for unless the proxy is trusted", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4" });
    expect(getClientIp(headers, { trustProxyHeaders: false })).toBe("unknown");
    expect(getClientIp(headers, { trustProxyHeaders: true })).toBe("1.2.3.4");
  });

  it("takes only the first hop of x-forwarded-for when trusted", () => {
    const headers = new Headers({ "x-forwarded-for": "9.9.9.9, 1.1.1.1" });
    expect(getClientIp(headers, { trustProxyHeaders: true })).toBe("9.9.9.9");
  });

  it("builds a normalized per-account key (case/space-insensitive)", () => {
    expect(emailKey("auth", "  Ada@Example.com ")).toBe("auth:email:ada@example.com");
  });
});

// ---------------------------------------------------------------------------
// Finding 1 (CSV import oversell) — importing a SELL of shares never owned, or
// selling more than the buys earlier in the same file, must be rejected so the
// import can't invent cash.
// ---------------------------------------------------------------------------
describe("CSV import oversell guard (finding 1)", () => {
  // Build an "ok" import result row carrying a BUY/SELL for instrument `x`.
  function tradeRow(
    row: number,
    type: "BUY" | "SELL",
    quantity: number,
    instrumentId = "x",
  ): ImportRowResult {
    const parsed = {
      type,
      instrumentId,
      quantity,
      pricePerUnit: 10,
      fee: 0,
      currency: "USD",
      tradeDate: new Date("2026-01-10"),
    } as unknown as TransactionInput;
    return { row, ok: true, parsed };
  }

  it("rejects a SELL of shares that were never owned", () => {
    const result = findImportOversell([tradeRow(1, "SELL", 5)], new Map());
    expect(result?.row).toBe(1);
    expect(result?.message).toContain("no shares are held");
  });

  it("rejects a SELL that exceeds buys earlier in the same file", () => {
    const rows = [tradeRow(1, "BUY", 4), tradeRow(2, "SELL", 5)];
    const result = findImportOversell(rows, new Map());
    expect(result?.row).toBe(2);
  });

  it("allows a SELL covered by earlier buys in the same file", () => {
    const rows = [tradeRow(1, "BUY", 10), tradeRow(2, "SELL", 6)];
    expect(findImportOversell(rows, new Map())).toBeNull();
  });

  it("counts shares already held before the import", () => {
    const starting = new Map([["x", 8]]);
    expect(findImportOversell([tradeRow(1, "SELL", 8)], starting)).toBeNull();
    expect(findImportOversell([tradeRow(1, "SELL", 9)], starting)?.row).toBe(1);
  });

  it("keeps positions separate per instrument", () => {
    // Buying `x` does nothing for a SELL of `y`.
    const rows = [tradeRow(1, "BUY", 10, "x"), tradeRow(2, "SELL", 1, "y")];
    expect(findImportOversell(rows, new Map())?.row).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Finding 3 (CSV import dry-run over-promised) — the dry-run report must not
// say "all rows look good" when the same oversell check the commit step runs
// would actually reject one of them.
// ---------------------------------------------------------------------------
describe("import dry-run oversell projection (finding 3)", () => {
  function tradeRow(
    row: number,
    type: "BUY" | "SELL",
    quantity: number,
    instrumentId = "x",
  ): ImportRowResult {
    const parsed = {
      type,
      instrumentId,
      quantity,
      pricePerUnit: 10,
      fee: 0,
      currency: "USD",
      tradeDate: new Date("2026-01-10"),
    } as unknown as TransactionInput;
    return { row, ok: true, parsed };
  }

  it("leaves an honestly-clean report untouched", () => {
    const report: ImportValidationReport = {
      total: 1,
      validCount: 1,
      errorCount: 0,
      results: [tradeRow(1, "BUY", 5)],
    };
    applyOversellProjection(report, new Map());
    expect(report.validCount).toBe(1);
    expect(report.errorCount).toBe(0);
    expect(report.results[0].ok).toBe(true);
  });

  it("downgrades the oversell row to a failure instead of over-promising", () => {
    const report: ImportValidationReport = {
      total: 1,
      validCount: 1,
      errorCount: 0,
      results: [tradeRow(1, "SELL", 5)], // no shares held anywhere
    };
    applyOversellProjection(report, new Map());
    expect(report.validCount).toBe(0);
    expect(report.errorCount).toBe(1);
    const result = report.results[0];
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.issues[0]).toContain("no shares are held");
  });

  it("accounts for shares already held before the import", () => {
    const report: ImportValidationReport = {
      total: 1,
      validCount: 1,
      errorCount: 0,
      results: [tradeRow(1, "SELL", 8)],
    };
    applyOversellProjection(report, new Map([["x", 8]]));
    expect(report.validCount).toBe(1);
    expect(report.results[0].ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Finding 3 (spoofed Origin) — the same-origin check used by the proxy to turn
// a mismatched Origin into a clean 400 instead of an unhandled 500.
// ---------------------------------------------------------------------------
describe("same-origin request check (finding 3)", () => {
  it("allows a request with no Origin header (server-to-server)", () => {
    expect(isSameOrigin(new Headers({ host: "app.example.com" }))).toBe(true);
  });

  it("allows an Origin whose host matches the request host", () => {
    const headers = new Headers({
      host: "app.example.com",
      origin: "https://app.example.com",
    });
    expect(isSameOrigin(headers)).toBe(true);
  });

  it("rejects a spoofed Origin from another site", () => {
    const headers = new Headers({
      host: "app.example.com",
      origin: "https://evil.example.net",
    });
    expect(isSameOrigin(headers)).toBe(false);
  });

  it("prefers x-forwarded-host when present (behind a proxy)", () => {
    const headers = new Headers({
      host: "internal:3000",
      "x-forwarded-host": "app.example.com",
      origin: "https://app.example.com",
    });
    expect(isSameOrigin(headers)).toBe(true);
  });

  it("rejects a malformed Origin header", () => {
    const headers = new Headers({ host: "app.example.com", origin: "not-a-url" });
    expect(isSameOrigin(headers)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Finding 4 (per-browser anonymous id) — a signed cookie value the client
// can't forge, so anonymous rate-limit buckets aren't shared by everyone.
// ---------------------------------------------------------------------------
describe("signed per-browser anon id (finding 4)", () => {
  it("round-trips a minted id through sign/verify", () => {
    const id = mintAnonId();
    expect(verifyAnonId(signAnonId(id))).toBe(id);
  });

  it("mints a fresh, unique id each time", () => {
    expect(mintAnonId()).not.toBe(mintAnonId());
  });

  it("rejects a tampered id (signature no longer matches)", () => {
    const signed = signAnonId("abc123");
    const tampered = signed.replace("abc123", "abc124");
    expect(verifyAnonId(tampered)).toBeNull();
  });

  it("rejects missing or malformed cookie values", () => {
    expect(verifyAnonId(undefined)).toBeNull();
    expect(verifyAnonId("")).toBeNull();
    expect(verifyAnonId("no-signature")).toBeNull();
    expect(verifyAnonId("id.")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Finding 2 (malformed Server Action body) — the proxy's pre-check that stops
// a broken request body from reaching Next.js's internal decoder (which would
// otherwise crash with an unhandled 500 before createTransaction/
// importTransactions' own Zod validation ever runs).
// ---------------------------------------------------------------------------
describe("Server Action body decode guard (finding 2)", () => {
  it("accepts a well-formed multipart body", async () => {
    const form = new FormData();
    form.set("0", "hello");
    const request = new Request("https://app.example.com/portfolio", {
      method: "POST",
      body: form,
    });
    expect(await isActionBodyDecodable(request)).toBe(true);
  });

  it("rejects a multipart body with a broken boundary", async () => {
    const request = new Request("https://app.example.com/portfolio", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=----broken" },
      body: "this is not valid multipart data at all",
    });
    expect(await isActionBodyDecodable(request)).toBe(false);
  });

  it("accepts a plain-text (non-multipart) fetch-action body", async () => {
    const request = new Request("https://app.example.com/portfolio", {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: '["$1"]',
    });
    expect(await isActionBodyDecodable(request)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Finding 4 (shared-bucket DoS, one layer down) — with Better Auth's IP-keyed
// limiter disabled, OUR limiter keys on a per-browser id, so one browser
// exhausting its bucket must NOT lock out a different browser. A single
// account/token stays bounded via the per-target key no matter the browser.
// ---------------------------------------------------------------------------
describe("per-browser buckets stay independent (finding 4 — better-auth limiter off)", () => {
  /** Flood a key past the limit and return whether the last call was denied. */
  function floodPastLimit(key: string): RateLimitResult {
    let last: RateLimitResult = { ok: true, remaining: 0 };
    for (let i = 0; i < AUTH_RATE_LIMIT.limit + 2; i += 1) {
      last = rateLimit(key, AUTH_RATE_LIMIT);
    }
    return last;
  }

  it("browser A's exhausted bucket does not block browser B", () => {
    const suffix = Math.random().toString(36).slice(2);
    const browserA = ipKey("auth", `anonA-${suffix}`);
    const browserB = ipKey("auth", `anonB-${suffix}`);

    // Browser A signs in over and over until it's locked out.
    expect(floodPastLimit(browserA).ok).toBe(false);

    // A brand-new browser (fresh cookie jar) is completely unaffected.
    expect(rateLimit(browserB, AUTH_RATE_LIMIT).ok).toBe(true);
  });

  it("a single account stays bounded across rotating browsers (per-email key)", () => {
    const email = `victim-${Math.random().toString(36).slice(2)}@example.com`;
    // Same target email, hit from many different browsers — the per-email
    // bucket still fills up and denies.
    expect(floodPastLimit(emailKey("auth", email)).ok).toBe(false);
  });

  it("a single reset token stays bounded (per-token key)", () => {
    const token = `reset-${Math.random().toString(36).slice(2)}`;
    expect(floodPastLimit(tokenKey("auth", token)).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MEDIUM fix — sign-in's per-account lockout used to block a CORRECT password
// once tripped (a single-account lockout DoS by anyone who knows the email).
// The auth route now applies the per-email key OUTCOME-based: `peekRateLimit`
// never itself counts as a hit, only `rateLimit` (called after a FAILED
// sign-in) does, and `resetRateLimit` (called after a SUCCESSFUL sign-in)
// clears it — mirrors Bean & Brew's admin-login limiter.
// ---------------------------------------------------------------------------
describe("outcome-based per-account limiter (sign-in lockout fix)", () => {
  it("peeking never itself counts as a hit", () => {
    const key = `peek-test-${Math.random().toString(36).slice(2)}`;
    expect(peekRateLimit(key, AUTH_RATE_LIMIT).ok).toBe(true);
    for (let i = 0; i < AUTH_RATE_LIMIT.limit - 1; i += 1) rateLimit(key, AUTH_RATE_LIMIT);
    // One hit short of the limit: still ok, and repeated peeks don't change that
    // (only a real `rateLimit` call moves the count).
    expect(peekRateLimit(key, AUTH_RATE_LIMIT).ok).toBe(true);
    expect(peekRateLimit(key, AUTH_RATE_LIMIT).ok).toBe(true);
    // The real (limit)th hit is still allowed...
    expect(rateLimit(key, AUTH_RATE_LIMIT).ok).toBe(true);
    // ...and now the bucket is full: peek correctly predicts a further hit
    // would be denied, without registering one itself.
    expect(peekRateLimit(key, AUTH_RATE_LIMIT).ok).toBe(false);
    expect(peekRateLimit(key, AUTH_RATE_LIMIT).ok).toBe(false);
  });

  it("resetRateLimit clears a bucket entirely", () => {
    const key = `reset-test-${Math.random().toString(36).slice(2)}`;
    for (let i = 0; i < AUTH_RATE_LIMIT.limit + 2; i += 1) rateLimit(key, AUTH_RATE_LIMIT);
    expect(rateLimit(key, AUTH_RATE_LIMIT).ok).toBe(false);
    resetRateLimit(key);
    expect(rateLimit(key, AUTH_RATE_LIMIT).ok).toBe(true);
  });

  it("a correct sign-in always passes even after the account is locked for wrong guesses", () => {
    const email = `victim-lockout-${Math.random().toString(36).slice(2)}@example.com`;
    const key = emailKey("auth", email);

    // Simulate a pile of WRONG guesses the way the route now handles them:
    // peek first, and only register (rateLimit) when not already denied.
    for (let i = 0; i < AUTH_RATE_LIMIT.limit + 5; i += 1) {
      if (peekRateLimit(key, AUTH_RATE_LIMIT).ok) rateLimit(key, AUTH_RATE_LIMIT);
    }
    // Further wrong guesses are now denied.
    expect(peekRateLimit(key, AUTH_RATE_LIMIT).ok).toBe(false);

    // A CORRECT password is never gated on this key at all in the route (it
    // only reads it to reset) — simulate the success branch directly.
    resetRateLimit(key);
    expect(peekRateLimit(key, AUTH_RATE_LIMIT).ok).toBe(true);
  });
});

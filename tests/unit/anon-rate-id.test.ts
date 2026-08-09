import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal stand-in for the Next.js cookie store `cookies()` returns — just
// enough of the surface (get/set) for anonymousRateLimitId to work against.
const cookieJar = new Map<string, string>();
const setSpy = vi.fn((name: string, value: string) => {
  cookieJar.set(name, value);
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: setSpy,
  })),
}));

import { anonymousRateLimitId } from "@/lib/anon-rate-id";
import { SOCKET_IP_HEADER, verifyAnonId } from "@/lib/rate-limit";

describe("anonymousRateLimitId — first-contact bucket (rate-limit finding)", () => {
  beforeEach(() => {
    cookieJar.clear();
    setSpy.mockClear();
    delete process.env.TRUST_PROXY_HEADERS;
  });

  it("keys a cookie-less FIRST request on a fresh per-browser id, never the shared 'unknown' bucket", async () => {
    const id = await anonymousRateLimitId(new Headers());

    expect(id).not.toBe("unknown");
    // The id returned for THIS request must be the exact id just minted and
    // signed into the cookie for next time — not some other/shared value.
    expect(setSpy).toHaveBeenCalledTimes(1);
    const [cookieName, cookieValue] = setSpy.mock.calls[0] as [string, string];
    expect(cookieName).toBe("iq_anon");
    expect(verifyAnonId(cookieValue)).toBe(id);
  });

  it("gives two different cookie-less first-time browsers two different ids (no shared bucket)", async () => {
    const first = await anonymousRateLimitId(new Headers());
    cookieJar.clear(); // simulate a second, unrelated browser with no cookie
    const second = await anonymousRateLimitId(new Headers());

    expect(first).not.toBe("unknown");
    expect(second).not.toBe("unknown");
    expect(first).not.toBe(second);
  });

  it("reuses the id already carried in a valid signed cookie (returning visitor)", async () => {
    const first = await anonymousRateLimitId(new Headers());
    // Same headers, cookie jar now holds the signed cookie set above.
    const second = await anonymousRateLimitId(new Headers());

    expect(second).toBe(first);
    // No new cookie needed to be set on the second call.
    expect(setSpy).toHaveBeenCalledTimes(1);
  });
});

// R4 follow-up finding: a client that never persists the iq_anon cookie
// (curl, a bot dropping Set-Cookie) used to get a FRESH id — and therefore a
// fresh rate-limit bucket — on every single request, making anonymous
// sign-in/sign-up/reset effectively unthrottled. The fix: a cookie-less
// caller is now keyed on the real socket IP (src/instrumentation.ts stamps
// SOCKET_IP_HEADER onto every request — see instrumentation-socket-ip.test.ts
// for proof that header can't be spoofed by the caller), which is stable per
// real source, so repeated requests from the SAME source share one bounded
// bucket while two different sources still get separate ones.
describe("anonymousRateLimitId — cookie-less callers are bounded by real socket IP", () => {
  beforeEach(() => {
    cookieJar.clear();
    setSpy.mockClear();
    delete process.env.TRUST_PROXY_HEADERS;
  });

  function headersFromSource(ip: string): Headers {
    const headers = new Headers();
    headers.set(SOCKET_IP_HEADER, ip);
    return headers;
  }

  it("bounds a cookie-less flood from ONE real source to a single stable bucket", async () => {
    // Simulate a client that never keeps the cookie (like curl): the cookie
    // jar is cleared before every request, exactly like a fresh, cookie-less
    // request would look on the wire — but the socket IP stays the same.
    const first = await anonymousRateLimitId(headersFromSource("203.0.113.9"));
    cookieJar.clear();
    const second = await anonymousRateLimitId(headersFromSource("203.0.113.9"));
    cookieJar.clear();
    const third = await anonymousRateLimitId(headersFromSource("203.0.113.9"));

    expect(first).toBe("socket:203.0.113.9");
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("gives two different real sources two different buckets", async () => {
    const a = await anonymousRateLimitId(headersFromSource("203.0.113.9"));
    cookieJar.clear();
    const b = await anonymousRateLimitId(headersFromSource("198.51.100.4"));

    expect(a).toBe("socket:203.0.113.9");
    expect(b).toBe("socket:198.51.100.4");
    expect(a).not.toBe(b);
  });

  it("still prefers a valid cookie over the socket IP once one is set", async () => {
    const first = await anonymousRateLimitId(headersFromSource("203.0.113.9"));
    expect(first).toBe("socket:203.0.113.9");

    // Same headers (same source) — but the cookie jar now holds the cookie
    // that first call set, so this real browser moves onto its own
    // per-browser bucket instead of falling back to the socket IP again.
    const second = await anonymousRateLimitId(headersFromSource("203.0.113.9"));
    expect(second).not.toBe("socket:203.0.113.9");

    const [, cookieValue] = setSpy.mock.calls[0] as [string, string];
    expect(second).toBe(verifyAnonId(cookieValue));
  });
});

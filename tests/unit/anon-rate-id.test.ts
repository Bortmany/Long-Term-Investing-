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
import { verifyAnonId } from "@/lib/rate-limit";

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

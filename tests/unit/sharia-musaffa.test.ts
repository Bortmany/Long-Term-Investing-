// The Musaffa adapter against FAKE replies only (no real key, no network).
// Field names are UNVERIFIED AGAINST THE REAL API, so these tests prove the
// behaviour rules: only a mapped status plus a method name and a date become
// a verdict; everything else is "no verdict" or "unavailable".

import { afterEach, describe, expect, it, vi } from "vitest";
import { createMusaffaVendor, getMusaffaVendor, isMusaffaConfigured, mapMusaffaReply } from "@/lib/sharia/musaffa";
import { activeVendorId, isShariaConfigured } from "@/lib/sharia/config";

const KEY = "fake-musaffa-key-do-not-leak";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function vendorWith(fetchFn: typeof fetch) {
  return createMusaffaVendor({ apiKey: KEY, fetchFn, timeoutMs: 200 });
}

const good = {
  status: "compliant",
  methodology: { name: "Fake method", version: "v1" },
  as_of: "2026-09-29",
  ratios: { debt: 0.12, cash: 0.05, junk: "x" },
};

afterEach(() => vi.restoreAllMocks());

describe("Musaffa adapter", () => {
  it("maps a Compliant and a Not-compliant reply", async () => {
    const a = await vendorWith(async () => jsonResponse(good)).fetchVerdict({ ticker: "AAPL", market: "US" });
    expect(a).toMatchObject({
      kind: "verdict",
      verdict: "COMPLIANT",
      methodName: "Fake method",
      methodVersion: "v1",
      ratios: { debt: 0.12, cash: 0.05 },
    });
    const b = await vendorWith(async () => jsonResponse({ ...good, status: "Non-Compliant" })).fetchVerdict({
      ticker: "X",
      market: "TADAWUL",
    });
    expect(b).toMatchObject({ kind: "verdict", verdict: "NOT_COMPLIANT" });
  });

  it("an unknown status word (e.g. questionable) is no verdict, counted as unmapped", async () => {
    const result = await vendorWith(async () => jsonResponse({ ...good, status: "questionable" })).fetchVerdict({
      ticker: "X",
      market: "US",
    });
    expect(result).toEqual({ kind: "no_verdict", unmappedStatus: true });
  });

  it("a reply with no method name or no date is never a verdict", () => {
    expect(mapMusaffaReply({ ...good, methodology: undefined })).toEqual({ kind: "no_verdict" });
    expect(mapMusaffaReply({ ...good, as_of: "not a date" })).toEqual({ kind: "no_verdict" });
    expect(mapMusaffaReply({ ...good, as_of: undefined })).toEqual({ kind: "no_verdict" });
  });

  it("empty, wrong-shape and non-JSON bodies are unavailable, never a verdict", async () => {
    for (const body of [null, [], "text", 42, {}]) {
      expect(mapMusaffaReply(body).kind).not.toBe("verdict");
    }
    const notJson = await vendorWith(async () => new Response("<html>", { status: 200 })).fetchVerdict({
      ticker: "X",
      market: "US",
    });
    expect(notJson).toEqual({ kind: "unavailable", reason: "error" });
  });

  it("maps HTTP failures to typed results", async () => {
    const call = (status: number) =>
      vendorWith(async () => new Response("{}", { status })).fetchVerdict({ ticker: "X", market: "US" });
    expect(await call(401)).toEqual({ kind: "unavailable", reason: "auth_failed" });
    expect(await call(403)).toEqual({ kind: "unavailable", reason: "auth_failed" });
    expect(await call(429)).toEqual({ kind: "unavailable", reason: "rate_limited" });
    expect(await call(500)).toEqual({ kind: "unavailable", reason: "error" });
    expect(await call(404)).toEqual({ kind: "no_verdict" });
  });

  it("a timeout or network error is unavailable", async () => {
    const slow: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    expect(await vendorWith(slow).fetchVerdict({ ticker: "X", market: "US" })).toEqual({
      kind: "unavailable",
      reason: "error",
    });
  });

  it("never asks about an uncovered exchange", async () => {
    const fetchFn = vi.fn();
    const result = await vendorWith(fetchFn as unknown as typeof fetch).fetchVerdict({ ticker: "BKMB", market: "MSX" });
    expect(result).toEqual({ kind: "no_verdict" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("the key goes in a header only, and never appears in a result or a log line", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((line) => void logs.push(String(line)));
    vi.spyOn(console, "error").mockImplementation((line) => void logs.push(String(line)));
    let seenUrl = "";
    let seenHeaders: HeadersInit | undefined;
    const throwing: typeof fetch = async (url, init) => {
      seenUrl = String(url);
      seenHeaders = init?.headers;
      throw new Error(`boom ${KEY} ${String(url)}`);
    };
    const result = await vendorWith(throwing).fetchVerdict({ ticker: "AAPL", market: "US" });
    expect(seenUrl).not.toContain(KEY);
    expect(JSON.stringify(seenHeaders)).toContain(KEY);
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(logs.join("\n")).not.toContain(KEY);
    expect(logs.join("\n")).not.toContain("api.musaffa");
  });
});

describe("dormant without a key", () => {
  it("no key means no adapter, and not configured", () => {
    expect(isMusaffaConfigured({})).toBe(false);
    expect(isMusaffaConfigured({ MUSAFFA_API_KEY: "   " })).toBe(false);
    expect(getMusaffaVendor({})).toBeNull();
    expect(isShariaConfigured({})).toBe(false);
  });

  it("a key makes it configured; an unknown SHARIA_VENDOR turns screening off", () => {
    expect(isShariaConfigured({ MUSAFFA_API_KEY: KEY })).toBe(true);
    expect(isShariaConfigured({ MUSAFFA_API_KEY: KEY, SHARIA_VENDOR: "musaffa" })).toBe(true);
    expect(activeVendorId({ SHARIA_VENDOR: "zoya" })).toBeNull();
    expect(isShariaConfigured({ MUSAFFA_API_KEY: KEY, SHARIA_VENDOR: "zoya" })).toBe(false);
  });
});

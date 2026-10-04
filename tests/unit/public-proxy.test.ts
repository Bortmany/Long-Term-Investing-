import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { isPublicPath, publicLimitClass } from "@/lib/public-paths";
import { checkPublicRateLimit } from "@/lib/public-limit";
import { SOCKET_IP_HEADER } from "@/lib/rate-limit";
import { proxy } from "@/proxy";

describe("public paths", () => {
  it("public stock pages, sitemap and robots are public", () => {
    for (const p of ["/s/US/AAPL", "/s/TADAWUL/2222.SR", "/s", "/sitemap.xml", "/robots.txt", "/"]) {
      expect(isPublicPath(p), p).toBe(true);
    }
  });
  it("sitemap and robots are exact-match only; look-alikes stay private", () => {
    for (const p of [
      "/sitemap.xml/x",
      "/robots.txt.bak",
      "/sitemap.xml.gz",
      "/stocks",
      "/settings",
      "/api/billing",
      "/sx",
      "/dashboard",
    ]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });
  it("only public pages and the two files are limited", () => {
    expect(publicLimitClass("/s/US/AAPL")).toBe("page");
    expect(publicLimitClass("/sitemap.xml")).toBe("file");
    expect(publicLimitClass("/robots.txt")).toBe("file");
    expect(publicLimitClass("/sign-in")).toBeNull();
    expect(publicLimitClass("/dashboard")).toBeNull();
    expect(publicLimitClass("/stocks")).toBeNull();
  });
});

function request(path: string, ip: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { [SOCKET_IP_HEADER]: ip },
  });
}

describe("proxy limit on public pages", () => {
  it("the 61st page request in a minute from one address gets 429 with Retry-After and no cookie", async () => {
    for (let i = 0; i < 60; i++) {
      const res = await proxy(request("/s/US/AAPL", "10.0.0.1"));
      expect(res.status).toBe(200);
    }
    const res = await proxy(request("/s/US/AAPL", "10.0.0.1"));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toContain("Too many requests");
    // Another visitor is unaffected.
    expect((await proxy(request("/s/US/AAPL", "10.0.0.2"))).status).toBe(200);
  });

  it("the 11th sitemap/robots request gets 429; sign-in is not counted", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await proxy(request("/sitemap.xml", "10.0.0.3"))).status).toBe(200);
    }
    const res = await proxy(request("/robots.txt", "10.0.0.3"));
    expect(res.status).toBe(429);
    expect(await res.text()).toMatch(/^Too many requests\. Please wait about \d+ seconds?\.$/);

    for (let i = 0; i < 80; i++) {
      const signIn = await proxy(request("/sign-in", "10.0.0.3"));
      expect(signIn.status).toBe(200);
    }
  });

  it("public responses never set a cookie", async () => {
    const res = await proxy(request("/s/US/MSFT", "10.0.0.4"));
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("with no address available the limit is skipped, not shared", () => {
    for (let i = 0; i < 100; i++) {
      expect(checkPublicRateLimit("/s/US/AAPL", new Headers())).toBeNull();
    }
  });

  it("signed-out visitors are still sent to sign-in for private pages", async () => {
    const res = await proxy(request("/stocks", "10.0.0.5"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/sign-in");
  });
});

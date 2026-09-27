// /api/health must not tell an anonymous caller which integrations are
// configured. Only `{ status, db }` goes out to the world; the full detail is
// for a signed-in user or a caller holding the CRON_SECRET bearer token.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(async () => [{ "?column?": 1 }]) },
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } },
  signUpsAllowed: () => false,
}));
vi.mock("@/lib/email/send", () => ({ isEmailConfigured: () => false }));

import { GET } from "@/app/api/health/route";

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/health", { headers });
}

describe("/api/health caller-aware shape", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    getSession.mockReset();
    getSession.mockResolvedValue(null);
    process.env.CRON_SECRET = "a-long-test-cron-secret-value";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("anonymous caller gets only status and db", async () => {
    const body = await (await GET(request())).json();
    expect(body).toEqual({ status: "ok", db: true });
  });

  it("a wrong bearer token is treated as anonymous", async () => {
    const body = await (await GET(request({ authorization: "Bearer nope" }))).json();
    expect(body).toEqual({ status: "ok", db: true });
  });

  it("the CRON_SECRET bearer unlocks the full detail", async () => {
    const body = await (
      await GET(request({ authorization: "Bearer a-long-test-cron-secret-value" }))
    ).json();
    expect(body).toMatchObject({
      status: "ok",
      db: true,
      sentry: "dormant",
      cron: "configured",
      email: "dormant",
      signups: "closed",
    });
  });

  it("a signed-in session unlocks the full detail", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    const body = await (await GET(request())).json();
    expect(Object.keys(body).sort()).toEqual(
      ["cron", "db", "email", "sentry", "signups", "status"].sort(),
    );
  });

  it("with no CRON_SECRET set, any bearer token is still anonymous", async () => {
    delete process.env.CRON_SECRET;
    const body = await (await GET(request({ authorization: "Bearer anything" }))).json();
    expect(body).toEqual({ status: "ok", db: true });
  });
});

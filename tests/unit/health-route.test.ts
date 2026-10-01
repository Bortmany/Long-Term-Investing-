// /api/health must not tell an anonymous caller which integrations are
// configured. Only `{ status, db }` goes out to the world; the full detail is
// for a signed-in user or a caller holding the CRON_SECRET bearer token.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type SignUpStatus = { open: true } | { open: false; reason: "paused" | "email_unavailable" };

const getSession = vi.fn();
let signUpStatus: SignUpStatus = { open: false, reason: "paused" };
let billingMode: "dormant" | "test" | "live" = "dormant";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(async () => [{ "?column?": 1 }]) },
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } },
  getSignUpStatus: () => signUpStatus,
  signUpsAllowed: () => signUpStatus.open,
}));
vi.mock("@/lib/email/send", () => ({ isEmailConfigured: () => false }));
vi.mock("@/lib/billing/config", () => ({ getBillingMode: () => billingMode }));

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
    signUpStatus = { open: false, reason: "paused" };
    billingMode = "dormant";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("anonymous caller gets only status and db", async () => {
    const body = await (await GET(request())).json();
    expect(body).toEqual({ status: "ok", db: true });
  });

  it("anonymous caller never sees signups or billing, even when sign-ups are open", async () => {
    signUpStatus = { open: true };
    billingMode = "test";
    const body = await (await GET(request())).json();
    expect(body).toEqual({ status: "ok", db: true });
  });

  it("a wrong bearer token is treated as anonymous", async () => {
    const body = await (await GET(request({ authorization: "Bearer nope" }))).json();
    expect(body).toEqual({ status: "ok", db: true });
  });

  it("the CRON_SECRET bearer unlocks the full detail (paused by SIGNUPS_PAUSED)", async () => {
    const body = await (
      await GET(request({ authorization: "Bearer a-long-test-cron-secret-value" }))
    ).json();
    expect(body).toEqual({
      status: "ok",
      db: true,
      sentry: "dormant",
      cron: "configured",
      email: "dormant",
      signups: "paused",
      signupsReason: "SIGNUPS_PAUSED",
      billing: "dormant",
      twelveData: "dormant",
    });
  });

  it("reports email_not_configured when production has no email", async () => {
    signUpStatus = { open: false, reason: "email_unavailable" };
    getSession.mockResolvedValue({ user: { id: "u1" } });
    const body = await (await GET(request())).json();
    expect(body.signups).toBe("paused");
    expect(body.signupsReason).toBe("email_not_configured");
  });

  it("open sign-ups have no signupsReason, and billing mode is passed through", async () => {
    signUpStatus = { open: true };
    billingMode = "test";
    getSession.mockResolvedValue({ user: { id: "u1" } });
    const body = await (await GET(request())).json();
    expect(body.signups).toBe("open");
    expect(body).not.toHaveProperty("signupsReason");
    expect(body.billing).toBe("test");
  });

  it("a signed-in session unlocks the full detail", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    const body = await (await GET(request())).json();
    expect(Object.keys(body).sort()).toEqual(
      [
        "billing",
        "cron",
        "db",
        "email",
        "sentry",
        "signups",
        "signupsReason",
        "status",
        "twelveData",
      ].sort(),
    );
  });

  it("signed-in view reports twelveData dormant with no key, configured with one", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    const originalKey = process.env.TWELVE_DATA_API_KEY;
    try {
      delete process.env.TWELVE_DATA_API_KEY;
      expect((await (await GET(request())).json()).twelveData).toBe("dormant");

      process.env.TWELVE_DATA_API_KEY = "fake-health-key-123";
      const body = await (await GET(request())).json();
      expect(body.twelveData).toBe("configured");
      // Only the yes/no answer is shown — never the key.
      expect(JSON.stringify(body)).not.toContain("fake-health-key-123");
    } finally {
      if (originalKey === undefined) delete process.env.TWELVE_DATA_API_KEY;
      else process.env.TWELVE_DATA_API_KEY = originalKey;
    }
  });

  it("anonymous callers never see twelveData, even when a key is set", async () => {
    const originalKey = process.env.TWELVE_DATA_API_KEY;
    process.env.TWELVE_DATA_API_KEY = "fake-health-key-123";
    try {
      const body = await (await GET(request())).json();
      expect(body).toEqual({ status: "ok", db: true });
    } finally {
      if (originalKey === undefined) delete process.env.TWELVE_DATA_API_KEY;
      else process.env.TWELVE_DATA_API_KEY = originalKey;
    }
  });

  it("with no CRON_SECRET set, any bearer token is still anonymous", async () => {
    delete process.env.CRON_SECRET;
    const body = await (await GET(request({ authorization: "Bearer anything" }))).json();
    expect(body).toEqual({ status: "ok", db: true });
  });
});

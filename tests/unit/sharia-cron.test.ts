// POST /api/cron/sharia-refresh: same shape as the other cron routes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const refresh = vi.fn();
vi.mock("@/lib/sharia/refresh", () => ({
  DAILY_MAX_INSTRUMENTS: 500,
  refreshShariaScreens: (...args: unknown[]) => refresh(...args),
}));

import { POST } from "@/app/api/cron/sharia-refresh/route";
import { resetRateLimit, ipKey } from "@/lib/rate-limit";

const SECRET = "a-long-test-cron-secret-value";

function req(token?: string): Request {
  return new Request("http://localhost/api/cron/sharia-refresh", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("sharia-refresh cron route", () => {
  beforeEach(() => {
    refresh.mockReset();
    resetRateLimit(ipKey("cron-sharia-refresh", "unknown"));
    delete process.env.MUSAFFA_API_KEY;
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.MUSAFFA_API_KEY;
  });

  it("no CRON_SECRET: 503 dormant and no work", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req(SECRET));
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("dormant");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("wrong or missing bearer: 401", async () => {
    expect((await POST(req("nope"))).status).toBe(401);
    expect((await POST(req())).status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("right bearer but no supplier key: 503 dormant and no outside call", async () => {
    const res = await POST(req(SECRET));
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("dormant");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("everything set: 200 with counts only", async () => {
    process.env.MUSAFFA_API_KEY = "fake-key";
    refresh.mockResolvedValue({
      status: "ok",
      screened: 3,
      removed: 1,
      keptOnError: 0,
      skippedUncovered: 2,
      unmappedStatuses: 0,
      stoppedEarly: false,
      capReached: false,
    });
    const res = await POST(req(SECRET));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: "ok",
      screened: 3,
      removed: 1,
      keptOnError: 0,
      skippedUncovered: 2,
      unmappedStatuses: 0,
      stoppedEarly: false,
      capReached: false,
    });
    expect(JSON.stringify(body)).not.toContain("fake-key");
  });

  it("nobody has the switch on: 200 ok with a skipped note", async () => {
    process.env.MUSAFFA_API_KEY = "fake-key";
    refresh.mockResolvedValue({ status: "skipped", message: "x" });
    const res = await POST(req(SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", skipped: "nobody has turned the screen on" });
  });

  it("the 6th call in a minute from one caller gets 429", async () => {
    for (let i = 0; i < 5; i++) await POST(req(SECRET));
    expect((await POST(req(SECRET))).status).toBe(429);
  });
});

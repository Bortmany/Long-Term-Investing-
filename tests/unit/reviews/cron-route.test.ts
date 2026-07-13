import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the engine so this stays a pure unit test with no database: the real
// engine imports prisma, which we never want to touch here. We only care that
// the route's auth gate decides whether the engine is ever reached.
vi.mock("@/lib/reviews/weekly-review-engine", () => ({
  runWeeklyReviewForUser: vi.fn(),
}));

import { POST } from "@/app/api/cron/weekly-review/route";
import { runWeeklyReviewForUser } from "@/lib/reviews/weekly-review-engine";

const mockedEngine = vi.mocked(runWeeklyReviewForUser);

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/weekly-review", {
    method: "POST",
    headers,
  });
}

describe("POST /api/cron/weekly-review", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalUserId = process.env.CRON_USER_ID;

  beforeEach(() => {
    // Default/disabled state: no secret, no target user.
    delete process.env.CRON_SECRET;
    delete process.env.CRON_USER_ID;
    mockedEngine.mockReset();
  });

  afterEach(() => {
    if (originalSecret !== undefined) process.env.CRON_SECRET = originalSecret;
    else delete process.env.CRON_SECRET;
    if (originalUserId !== undefined) process.env.CRON_USER_ID = originalUserId;
    else delete process.env.CRON_USER_ID;
  });

  it("401s and never runs the engine when CRON_SECRET is unset (no auth header)", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
    expect(mockedEngine).not.toHaveBeenCalled();
  });

  it("401s and never runs the engine when the bearer token is wrong", async () => {
    process.env.CRON_SECRET = "the-real-secret";
    const response = await POST(makeRequest({ authorization: "Bearer wrong-token" }));
    expect(response.status).toBe(401);
    expect(mockedEngine).not.toHaveBeenCalled();
  });

  it("501s and never runs the engine when the token is right but CRON_USER_ID is unset", async () => {
    process.env.CRON_SECRET = "the-real-secret";
    const response = await POST(makeRequest({ authorization: "Bearer the-real-secret" }));
    expect(response.status).toBe(501);
    expect(mockedEngine).not.toHaveBeenCalled();
  });

  it("runs the engine once with the env userId when token + CRON_USER_ID are set", async () => {
    process.env.CRON_SECRET = "the-real-secret";
    process.env.CRON_USER_ID = "user-from-env";
    mockedEngine.mockResolvedValue({ ok: true, data: { id: "review-1", reused: false } });

    const response = await POST(makeRequest({ authorization: "Bearer the-real-secret" }));

    expect(mockedEngine).toHaveBeenCalledTimes(1);
    expect(mockedEngine).toHaveBeenCalledWith("user-from-env");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { id: "review-1", reused: false },
    });
  });
});

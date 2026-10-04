// Handled failures reach Sentry only when SENTRY_DSN is set, and never carry secrets.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => [] as { message: string; options: { extra?: Record<string, unknown> } }[]);
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (message: string, options: { extra?: Record<string, unknown> }) => {
    captured.push({ message, options });
  },
}));

import { logger } from "@/lib/logger";

beforeEach(() => {
  captured.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("logger.error and Sentry", () => {
  it("does nothing extra when SENTRY_DSN is not set", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    logger.error("Billing webhook could not be applied", { eventId: "evt_1" });
    await flush();
    expect(captured).toHaveLength(0);
  });

  it("sends the failure to Sentry with secrets redacted when SENTRY_DSN is set", async () => {
    vi.stubEnv("SENTRY_DSN", "https://example@o0.ingest.sentry.io/1");
    logger.error("Broker sync failed unexpectedly", { runId: "r1", token: "SECRET-VALUE" });
    await flush();
    expect(captured).toHaveLength(1);
    expect(captured[0].options.extra).toEqual({ runId: "r1", token: "[redacted]" });
    expect(JSON.stringify(captured)).not.toContain("SECRET-VALUE");
  });

  it("can skip Sentry for errors Next already reports", async () => {
    vi.stubEnv("SENTRY_DSN", "https://example@o0.ingest.sentry.io/1");
    logger.error("Unhandled server error", {}, { alert: false });
    await flush();
    expect(captured).toHaveLength(0);
  });
});

// getSignUpStatus() (go-public spec A8): sign-ups are OPEN by default,
// SIGNUPS_PAUSED="true" pauses them, and production without email refuses
// them as "email_unavailable". The landing page, the sign-up page, the
// server-side gate and /api/health all read this one function.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { getSignUpStatus, signUpsAllowed } from "@/lib/auth";

const KEYS = ["SIGNUPS_PAUSED", "RESEND_API_KEY", "RESEND_FROM", "NODE_ENV", "ALLOW_SIGNUPS"] as const;
const saved: Record<string, string | undefined> = {};
const env = process.env as Record<string, string | undefined>;

beforeEach(() => {
  for (const key of KEYS) saved[key] = env[key];
  for (const key of KEYS) delete env[key];
  env.NODE_ENV = "test";
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete env[key];
    else env[key] = saved[key];
  }
});

function withEmail() {
  env.RESEND_API_KEY = "re_test_placeholder";
  env.RESEND_FROM = "InvestIQ <no-reply@example.com>";
}

describe("getSignUpStatus", () => {
  it("is open by default (no settings at all)", () => {
    expect(getSignUpStatus()).toEqual({ open: true });
    expect(signUpsAllowed()).toBe(true);
  });

  it('SIGNUPS_PAUSED="true" pauses sign-ups', () => {
    env.SIGNUPS_PAUSED = "true";
    withEmail();
    expect(getSignUpStatus()).toEqual({ open: false, reason: "paused" });
    expect(signUpsAllowed()).toBe(false);
  });

  it("any other SIGNUPS_PAUSED value leaves them open", () => {
    env.SIGNUPS_PAUSED = "false";
    expect(getSignUpStatus()).toEqual({ open: true });
  });

  it("production without email → email_unavailable", () => {
    env.NODE_ENV = "production";
    expect(getSignUpStatus()).toEqual({ open: false, reason: "email_unavailable" });
  });

  it("production with email → open", () => {
    env.NODE_ENV = "production";
    withEmail();
    expect(getSignUpStatus()).toEqual({ open: true });
  });

  it("paused wins over email_unavailable", () => {
    env.NODE_ENV = "production";
    env.SIGNUPS_PAUSED = "true";
    expect(getSignUpStatus()).toEqual({ open: false, reason: "paused" });
  });

  it("development without email stays open (with the honest note on the page)", () => {
    env.NODE_ENV = "development";
    expect(getSignUpStatus()).toEqual({ open: true });
  });

  it("the retired ALLOW_SIGNUPS no longer changes anything", () => {
    env.ALLOW_SIGNUPS = "false";
    expect(getSignUpStatus()).toEqual({ open: true });
  });
});

describe("startup warning for the retired setting", () => {
  it("logs one warning when ALLOW_SIGNUPS is still set, none otherwise", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { register } = await import("@/instrumentation");

    await register();
    expect(warn.mock.calls.some((c) => String(c[0]).includes("ALLOW_SIGNUPS"))).toBe(false);

    env.ALLOW_SIGNUPS = "true";
    await register();
    const matching = warn.mock.calls.filter((c) =>
      String(c[0]).includes("ALLOW_SIGNUPS is no longer used; use SIGNUPS_PAUSED."),
    );
    expect(matching).toHaveLength(1);
    warn.mockRestore();
  });
});

// Who is on Pro (go-public spec B1): resolveEffectivePlan's cases, and the
// Pro gates holding when the server actions are called DIRECTLY — not only
// through the (hidden) buttons.
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  instrument: { findUnique: vi.fn() },
  thesis: { findFirst: vi.fn() },
  portfolio: { findFirst: vi.fn() },
  alert: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/user-portfolio", () => ({ getSessionUserId: vi.fn(async () => sessionUserId) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let sessionUserId = "user-free";

import {
  proRequiredMessage,
  RENEWAL_GRACE_MS,
  requirePro,
  resolveEffectivePlan,
} from "@/lib/plan-access";
import { conveneCommittee } from "@/app/actions/committee";
import { checkThesis } from "@/app/actions/theses";
import { runWeeklyReview } from "@/app/actions/reviews";
import { createAlert } from "@/app/actions/alerts";
import { runWeeklyReviewsForAllUsers } from "@/lib/reviews/run-for-user";

const NOW = new Date("2026-09-30T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const future = new Date(NOW.getTime() + 10 * DAY);
const past = new Date(NOW.getTime() - 10 * DAY);

describe("resolveEffectivePlan", () => {
  it("FREE stays Free, whatever the subscription row says", () => {
    expect(
      resolveEffectivePlan({
        plan: "FREE",
        subscription: { status: "active", currentPeriodEnd: future, providerSubscriptionId: "sub_1" },
        now: NOW,
      }),
    ).toBe("FREE");
  });

  it("owner-granted Pro (no subscription row) is always Pro", () => {
    expect(resolveEffectivePlan({ plan: "PRO", subscription: null, now: NOW })).toBe("PRO");
  });

  it("a checkout that was started but never finished doesn't count as a subscription", () => {
    expect(
      resolveEffectivePlan({
        plan: "PRO",
        subscription: { status: "checkout_started", currentPeriodEnd: null, providerSubscriptionId: null },
        now: NOW,
      }),
    ).toBe("PRO");
  });

  it("active subscription → Pro", () => {
    expect(
      resolveEffectivePlan({
        plan: "PRO",
        subscription: { status: "active", currentPeriodEnd: future, providerSubscriptionId: "sub_1" },
        now: NOW,
      }),
    ).toBe("PRO");
  });

  it("past due within the period → Pro", () => {
    expect(
      resolveEffectivePlan({
        plan: "PRO",
        subscription: { status: "past_due", currentPeriodEnd: future, providerSubscriptionId: "sub_1" },
        now: NOW,
      }),
    ).toBe("PRO");
  });

  it("cancelled → Pro until the period end, Free after", () => {
    const sub = { status: "canceled", providerSubscriptionId: "sub_1" };
    expect(
      resolveEffectivePlan({ plan: "PRO", subscription: { ...sub, currentPeriodEnd: future }, now: NOW }),
    ).toBe("PRO");
    expect(
      resolveEffectivePlan({ plan: "PRO", subscription: { ...sub, currentPeriodEnd: past }, now: NOW }),
    ).toBe("FREE");
  });

  it("incomplete / incomplete_expired / unpaid / paused are Free even with a future period end", () => {
    for (const status of ["incomplete", "incomplete_expired", "unpaid", "paused"]) {
      expect(
        resolveEffectivePlan({
          plan: "PRO",
          subscription: { status, currentPeriodEnd: future, providerSubscriptionId: "sub_1" },
          now: NOW,
        }),
      ).toBe("FREE");
    }
  });

  it("trialing → Pro", () => {
    expect(
      resolveEffectivePlan({
        plan: "PRO",
        subscription: { status: "trialing", currentPeriodEnd: future, providerSubscriptionId: "sub_1" },
        now: NOW,
      }),
    ).toBe("PRO");
  });

  it("lapsed (unpaid / incomplete_expired) with the period over → Free", () => {
    for (const status of ["unpaid", "incomplete_expired", "paused"]) {
      expect(
        resolveEffectivePlan({
          plan: "PRO",
          subscription: { status, currentPeriodEnd: past, providerSubscriptionId: "sub_1" },
          now: NOW,
        }),
      ).toBe("FREE");
    }
  });

  it("missed webhook: still 'active' on file but the period ended long ago → Free", () => {
    const longAgo = new Date(NOW.getTime() - RENEWAL_GRACE_MS - DAY);
    expect(
      resolveEffectivePlan({
        plan: "PRO",
        subscription: { status: "active", currentPeriodEnd: longAgo, providerSubscriptionId: "sub_1" },
        now: NOW,
      }),
    ).toBe("FREE");
    // …but a renewal message that is only a day late doesn't drop a paying customer.
    const yesterday = new Date(NOW.getTime() - DAY);
    expect(
      resolveEffectivePlan({
        plan: "PRO",
        subscription: { status: "active", currentPeriodEnd: yesterday, providerSubscriptionId: "sub_1" },
        now: NOW,
      }),
    ).toBe("PRO");
  });
});

describe("requirePro", () => {
  it("returns the standard 'part of Pro' sentence with code PRO_REQUIRED for a Free user", async () => {
    const result = await requirePro("u", "The full Investment Committee", {
      isProFn: async () => false,
      billingEnabled: false,
    });
    expect(result).toEqual({
      ok: false,
      code: "PRO_REQUIRED",
      error:
        "The full Investment Committee is part of Pro, which is coming soon. Everything you've already saved is still here.",
    });
  });

  it("while billing is on, points to Plans & billing instead of 'coming soon'", () => {
    expect(proRequiredMessage("The weekly AI review", true)).toBe(
      "The weekly AI review is part of Pro. You can upgrade in Settings, under Plans & billing. Everything you've already saved is still here.",
    );
  });

  it("lets a Pro user through", async () => {
    expect(await requirePro("u", "X", { isProFn: async () => true })).toEqual({ ok: true, data: null });
  });
});

describe("Pro gates hold when the actions are called directly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUserId = `user-free-${Math.random()}`; // fresh rate-limit bucket per test
    // A Free user with no subscription.
    prismaMock.user.findUnique.mockResolvedValue({ plan: "FREE", subscription: null });
  });

  const expectProRefusal = (result: { ok: boolean; code?: string; error?: string }) => {
    expect(result.ok).toBe(false);
    expect(result.code).toBe("PRO_REQUIRED");
    expect(result.error).toContain("is part of Pro");
  };

  it("conveneCommittee", async () => {
    expectProRefusal(await conveneCommittee("instrument-1"));
    expect(prismaMock.instrument.findUnique).not.toHaveBeenCalled();
  });

  it("checkThesis", async () => {
    expectProRefusal(await checkThesis("thesis-1"));
    expect(prismaMock.thesis.findFirst).not.toHaveBeenCalled();
  });

  it("runWeeklyReview", async () => {
    expectProRefusal(await runWeeklyReview());
    expect(prismaMock.portfolio.findFirst).not.toHaveBeenCalled();
  });

  it("creating a THESIS_REVIEW_DUE alert", async () => {
    expectProRefusal(
      await createAlert({ kind: "THESIS_REVIEW_DUE", thesisId: "thesis-1", intervalDays: 90 }),
    );
    expect(prismaMock.alert.create).not.toHaveBeenCalled();
  });

  it("the scheduled sweep skips Free users: counted as skipped, never run, never emailed", async () => {
    const runForUser = vi.fn(async () => ({ ok: true as const, data: { id: "review-1" } }));
    const summary = await runWeeklyReviewsForAllUsers(NOW, {
      listUserIds: async () => ["free-1", "pro-1", "free-2"],
      isProFn: async (userId) => userId.startsWith("pro"),
      runForUser,
    });
    expect(summary).toEqual({ usersProcessed: 3, succeeded: 1, failed: 0, skipped: 2 });
    expect(runForUser).toHaveBeenCalledTimes(1);
    expect(runForUser).toHaveBeenCalledWith("pro-1", NOW);
  });
});

// Deleting an account with a live subscription (go-public spec B7): the
// subscription is cancelled first; if that fails the deletion STOPS with the
// honest message; a wrong password can never cancel anything; billing off
// means no Stripe call at all.
import { beforeEach, describe, expect, it, vi } from "vitest";

const authApi = vi.hoisted(() => ({
  verifyPassword: vi.fn(),
  deleteUser: vi.fn(),
}));
const cancelSubscription = vi.hoisted(() => vi.fn());
const stripeState = vi.hoisted(() => ({ on: true }));
const subscriptionRow = vi.hoisted(() => ({
  value: { providerSubscriptionId: "sub_123", status: "active" } as {
    providerSubscriptionId: string | null;
    status: string;
  } | null,
}));

vi.mock("@/lib/auth", () => ({ auth: { api: authApi } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/user-portfolio", () => ({ getSessionUserId: vi.fn(async () => currentUser) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { subscription: { findUnique: vi.fn(async () => subscriptionRow.value) } },
}));
vi.mock("@/lib/billing/stripe-client", () => ({
  getStripe: () =>
    stripeState.on ? { subscriptions: { cancel: cancelSubscription } } : null,
}));

let currentUser = "user-1";

import { APIError } from "better-auth";
import { deleteMyAccount } from "@/app/actions/account";
import { logger } from "@/lib/logger";

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = `user-${Math.random()}`; // fresh rate-limit bucket per test
  stripeState.on = true;
  subscriptionRow.value = { providerSubscriptionId: "sub_123", status: "active" };
  authApi.verifyPassword.mockResolvedValue({ status: true });
  authApi.deleteUser.mockResolvedValue({ success: true });
  cancelSubscription.mockResolvedValue({ id: "sub_123", status: "canceled" });
});

describe("deleteMyAccount with billing", () => {
  it("cancels the subscription first, then deletes", async () => {
    const result = await deleteMyAccount({ password: "correct horse" });
    expect(result).toEqual({ ok: true, data: { redirectTo: "/sign-in" } });
    expect(cancelSubscription).toHaveBeenCalledWith("sub_123");
    expect(cancelSubscription.mock.invocationCallOrder[0]).toBeLessThan(
      authApi.deleteUser.mock.invocationCallOrder[0],
    );
  });

  it("stops with the honest message when the cancel fails — the account is NOT deleted", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});
    cancelSubscription.mockRejectedValueOnce(new Error("Stripe is down"));

    const result = await deleteMyAccount({ password: "correct horse" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(
        /^We couldn't cancel your subscription, so we haven't deleted your account yet\. Try again, or contact .+@.+\.$/,
      );
    }
    expect(authApi.deleteUser).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("a wrong password never cancels anyone's subscription", async () => {
    authApi.verifyPassword.mockRejectedValueOnce(new APIError("BAD_REQUEST"));
    const result = await deleteMyAccount({ password: "wrong" });
    expect(result).toEqual({ ok: false, error: "That password is incorrect. Please try again." });
    expect(cancelSubscription).not.toHaveBeenCalled();
    expect(authApi.deleteUser).not.toHaveBeenCalled();
  });

  it("billing off: no Stripe call at all, deletion goes ahead as before", async () => {
    stripeState.on = false;
    const result = await deleteMyAccount({ password: "correct horse" });
    expect(result.ok).toBe(true);
    expect(cancelSubscription).not.toHaveBeenCalled();
    expect(authApi.verifyPassword).not.toHaveBeenCalled();
  });

  it("an already-cancelled subscription needs no cancel call", async () => {
    subscriptionRow.value = { providerSubscriptionId: "sub_123", status: "canceled" };
    const result = await deleteMyAccount({ password: "correct horse" });
    expect(result.ok).toBe(true);
    expect(cancelSubscription).not.toHaveBeenCalled();
  });
});

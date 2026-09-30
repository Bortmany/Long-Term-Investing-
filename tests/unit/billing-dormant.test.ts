// Billing OFF means OFF (go-public spec B5): no Stripe object is ever built,
// the webhook answers 503 "dormant" without reading the body, checkout and
// portal say "Payments aren't turned on yet.", and a live key on a tester's
// machine keeps billing off. Plus checkout's own rules once it is ON.
// Fake `sk_test_…` strings only — never a real key.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stripeConstructed = vi.hoisted(() => vi.fn());
const staticConstructEvent = vi.hoisted(() => vi.fn());
vi.mock("stripe", () => {
  class FakeStripe {
    static webhooks = { constructEvent: staticConstructEvent };
    constructor(...args: unknown[]) {
      stripeConstructed(...args);
    }
  }
  return { default: FakeStripe };
});
vi.mock("@/lib/user-portfolio", () => ({ getSessionUserId: vi.fn(async () => "user-1") }));

import { getBillingMode, isBillingEnabled } from "@/lib/billing/config";
import { getStripe, type StripeLike } from "@/lib/billing/stripe-client";
import { createCheckoutUrl, createPortalUrl } from "@/lib/billing/checkout";
import { POST as webhookPost } from "@/app/api/billing/webhook/route";
import { openBillingPortal, startCheckout } from "@/app/actions/billing";
import { logger } from "@/lib/logger";

const ON_ENV = {
  BILLING_ENABLED: "true",
  NODE_ENV: "test",
  STRIPE_SECRET_KEY: "sk_test_fake_for_unit_tests",
  STRIPE_WEBHOOK_SECRET: "whsec_fake_for_unit_tests",
  STRIPE_PRICE_PRO_MONTHLY: "price_fake_monthly",
  STRIPE_PRICE_PRO_YEARLY: "price_fake_yearly",
  BETTER_AUTH_URL: "https://investiq.example",
};

const BILLING_VARS = [
  "BILLING_ENABLED",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_YEARLY",
];

beforeEach(() => {
  for (const name of BILLING_VARS) vi.stubEnv(name, "");
  stripeConstructed.mockClear();
  staticConstructEvent.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the billing switch", () => {
  it("is off unless BILLING_ENABLED=true AND all four Stripe values are set", () => {
    expect(getBillingMode({})).toBe("dormant");
    expect(getBillingMode({ ...ON_ENV, BILLING_ENABLED: "false" })).toBe("dormant");
    expect(getBillingMode({ ...ON_ENV, STRIPE_PRICE_PRO_YEARLY: "" })).toBe("dormant");
    expect(getBillingMode(ON_ENV)).toBe("test");
  });

  it("a sk_live_ key outside production stays OFF (one warning); live only in production", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const live = { ...ON_ENV, STRIPE_SECRET_KEY: "sk_live_fake_not_real" };
    expect(getBillingMode({ ...live, NODE_ENV: "development" })).toBe("dormant");
    expect(isBillingEnabled({ ...live, NODE_ENV: "test" })).toBe(false);
    expect(getBillingMode({ ...live, NODE_ENV: "production" })).toBe("live");
    // The warning never carries the key itself.
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sk_live_fake_not_real");
    warn.mockRestore();
  });
});

describe("while billing is OFF", () => {
  it("getStripe returns null and never constructs a Stripe object", () => {
    expect(getStripe({})).toBeNull();
    expect(stripeConstructed).not.toHaveBeenCalled();
  });

  it("the webhook answers 503 dormant, without reading the body or touching Stripe", async () => {
    const request = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=whatever" },
      body: JSON.stringify({ id: "evt_1", type: "customer.subscription.created" }),
    });

    const response = await webhookPost(request);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "dormant" });
    expect(request.bodyUsed).toBe(false);
    expect(stripeConstructed).not.toHaveBeenCalled();
    expect(staticConstructEvent).not.toHaveBeenCalled();
  });

  it("startCheckout and openBillingPortal answer \"Payments aren't turned on yet.\"", async () => {
    expect(await startCheckout("month")).toEqual({
      ok: false,
      error: "Payments aren't turned on yet.",
    });
    expect(await openBillingPortal()).toEqual({
      ok: false,
      error: "Payments aren't turned on yet.",
    });
    expect(stripeConstructed).not.toHaveBeenCalled();
  });
});

describe("once billing is ON (test mode, fake Stripe)", () => {
  it("builds exactly one client from the test key", () => {
    const client = getStripe(ON_ENV);
    expect(client).not.toBeNull();
    expect(stripeConstructed).toHaveBeenCalledTimes(1);
    expect(stripeConstructed.mock.calls[0][0]).toBe("sk_test_fake_for_unit_tests");
  });

  function fakeStripe() {
    const customersCreate = vi.fn(async () => ({ id: "cus_new" }));
    const sessionsCreate = vi.fn(async () => ({ url: "https://checkout.stripe.com/c/pay/cs_test_1" }));
    const portalCreate = vi.fn(async () => ({ url: "https://billing.stripe.com/p/session/test_1" }));
    const stripe = {
      customers: { create: customersCreate },
      checkout: { sessions: { create: sessionsCreate } },
      billingPortal: { sessions: { create: portalCreate } },
      subscriptions: { cancel: vi.fn() },
    } as unknown as StripeLike;
    return { stripe, customersCreate, sessionsCreate, portalCreate };
  }

  it("checkout: customer with email only, subscription mode, server-side price, idempotency key, hosted URL", async () => {
    const { stripe, customersCreate, sessionsCreate } = fakeStripe();
    const saved: unknown[] = [];
    const result = await createCheckoutUrl(
      { userId: "user-1", email: "ada@example.com", interval: "year", now: new Date("2026-09-30T12:00:00Z") },
      {
        stripe,
        env: ON_ENV,
        store: {
          getCustomerId: async () => null,
          saveCustomerId: async (...args) => {
            saved.push(args);
          },
        },
      },
    );

    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    const [customerParams] = customersCreate.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(customerParams).toEqual({ email: "ada@example.com", metadata: { userId: "user-1" } });
    expect(saved).toEqual([["user-1", "cus_new", "year"]]);

    const [params, options] = sessionsCreate.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { idempotencyKey: string },
    ];
    expect(params).toMatchObject({
      mode: "subscription",
      customer: "cus_new",
      client_reference_id: "user-1",
      line_items: [{ price: "price_fake_yearly", quantity: 1 }],
      success_url: "https://investiq.example/settings?billing=success",
      cancel_url: "https://investiq.example/settings?billing=cancelled",
    });
    expect(options.idempotencyKey).toMatch(/^investiq-checkout-user-1-year-/);
  });

  it("checkout reuses the stored customer instead of creating a second one", async () => {
    const { stripe, customersCreate, sessionsCreate } = fakeStripe();
    await createCheckoutUrl(
      { userId: "user-1", email: "ada@example.com", interval: "month" },
      {
        stripe,
        env: ON_ENV,
        store: { getCustomerId: async () => "cus_existing", saveCustomerId: vi.fn() },
      },
    );
    expect(customersCreate).not.toHaveBeenCalled();
    expect((sessionsCreate.mock.calls[0] as unknown as [{ customer: string }])[0].customer).toBe(
      "cus_existing",
    );
  });

  it("a Stripe failure gives the honest checkout message and logs no key", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});
    const { stripe, sessionsCreate } = fakeStripe();
    sessionsCreate.mockRejectedValueOnce(new Error("Invalid API Key provided: sk_test_***"));
    const result = await createCheckoutUrl(
      { userId: "user-1", email: "ada@example.com", interval: "month" },
      { stripe, env: ON_ENV, store: { getCustomerId: async () => "cus_1", saveCustomerId: vi.fn() } },
    );
    expect(result).toEqual({
      ok: false,
      message: "We couldn't open checkout. Nothing was charged. Please try again in a minute.",
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain("sk_test");
    error.mockRestore();
  });

  it("the portal opens only for the customer id we stored for this user", async () => {
    const { stripe, portalCreate } = fakeStripe();
    const result = await createPortalUrl(
      { userId: "user-1" },
      { stripe, env: ON_ENV, store: { getCustomerId: async () => "cus_mine", saveCustomerId: vi.fn() } },
    );
    expect(result).toEqual({ ok: true, url: "https://billing.stripe.com/p/session/test_1" });
    expect(portalCreate).toHaveBeenCalledWith({
      customer: "cus_mine",
      return_url: "https://investiq.example/settings#plans",
    });
  });
});

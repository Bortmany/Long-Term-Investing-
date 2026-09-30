// The Stripe webhook rules (go-public spec B7), with REAL signature checking
// (Stripe's own helper) and a fake, in-memory database: bad signature → 400
// and no change; good → applied; the same event twice → applied once;
// unknown event → 200; unknown customer → 200 and ignored; our failure → 500.
// Only fake test secrets are used — never a real key.
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleStripeWebhook,
  type SubscriptionUpdate,
  type WebhookStore,
  type WebhookTx,
} from "@/lib/billing/webhook";
import { logger } from "@/lib/logger";
import type { PlanName } from "@/lib/plans";

const SECRET = "whsec_fake_secret_for_unit_tests_only";
const NOW = new Date("2026-09-30T12:00:00Z");
const PERIOD_END = Math.floor(new Date("2026-10-30T12:00:00Z").getTime() / 1000);

/** An in-memory stand-in for the database: one user with a stored Stripe customer. */
function fakeDb(options: { failOnApply?: boolean } = {}) {
  const events = new Set<string>();
  const users = new Map<string, { plan: PlanName }>([["user-1", { plan: "FREE" }]]);
  const billing = new Map<
    string,
    { userId: string; providerSubscriptionId: string | null; update?: SubscriptionUpdate }
  >([["cus_known", { userId: "user-1", providerSubscriptionId: null }]]);
  const work = vi.fn();

  const tx: WebhookTx = {
    findByCustomerId: async (customerId) => {
      const row = billing.get(customerId);
      return row ? { userId: row.userId, providerSubscriptionId: row.providerSubscriptionId } : null;
    },
    linkSubscription: async (userId, subId) => {
      for (const row of billing.values()) if (row.userId === userId) row.providerSubscriptionId = subId;
    },
    updateSubscription: async (userId, update) => {
      if (options.failOnApply) throw new Error("database write failed");
      for (const row of billing.values()) {
        if (row.userId === userId) {
          row.providerSubscriptionId = update.providerSubscriptionId;
          row.update = update;
        }
      }
    },
    setPlan: async (userId, plan) => {
      users.get(userId)!.plan = plan;
    },
  };

  const store: WebhookStore = {
    runOnce: async (eventId, _type, fn) => {
      work(eventId);
      if (events.has(eventId)) return "duplicate";
      // Mirror the real transaction: the id is only kept if the work succeeds.
      await fn(tx);
      events.add(eventId);
      return "processed";
    },
  };
  return { store, users, billing, events, work };
}

// A fake Stripe: by default it answers with the subscription inside the event
// just signed; a test can set `stripeNow` to say what Stripe REALLY holds now.
let lastSigned: Record<string, unknown> | null = null;
let stripeNow: Record<string, unknown> | null = null;
const fakeStripe = async () =>
  (stripeNow ?? (lastSigned!.data as { object: unknown }).object) as unknown as Stripe.Subscription;

function signed(event: Record<string, unknown>) {
  lastSigned = event;
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return { rawBody: payload, signature };
}

function subscriptionEvent(
  id: string,
  type: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    object: "event",
    type,
    data: {
      object: {
        id: "sub_123",
        object: "subscription",
        customer: "cus_known",
        status: "active",
        cancel_at_period_end: false,
        cancel_at: null,
        items: {
          object: "list",
          data: [{ current_period_end: PERIOD_END, price: { recurring: { interval: "month" } } }],
        },
        ...overrides,
      },
    },
  };
}

describe("billing webhook — signature first", () => {
  it("a bad signature → 400, a warning without the body or secret, and nothing changes", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const db = fakeDb();
    const { rawBody } = signed(subscriptionEvent("evt_1", "customer.subscription.created"));

    const outcome = await handleStripeWebhook(
      { rawBody, signature: "t=1,v1=forged", secret: SECRET, now: NOW },
      { store: db.store, fetchSubscription: fakeStripe },
    );

    expect(outcome.status).toBe(400);
    expect(db.work).not.toHaveBeenCalled();
    expect(db.users.get("user-1")!.plan).toBe("FREE");
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain("cus_known");
    expect(logged).not.toContain("forged");
    warn.mockRestore();
  });

  it("a missing signature → 400 and nothing changes", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    const db = fakeDb();
    const outcome = await handleStripeWebhook(
      { rawBody: "{}", signature: null, secret: SECRET, now: NOW },
      { store: db.store, fetchSubscription: fakeStripe },
    );
    expect(outcome.status).toBe(400);
    expect(db.work).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("a body changed after signing → 400", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    const db = fakeDb();
    const { rawBody, signature } = signed(subscriptionEvent("evt_2", "customer.subscription.created"));
    const tampered = rawBody.replace("cus_known", "cus_other");
    const outcome = await handleStripeWebhook(
      { rawBody: tampered, signature, secret: SECRET, now: NOW },
      { store: db.store, fetchSubscription: fakeStripe },
    );
    expect(outcome.status).toBe(400);
    expect(db.work).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

beforeEach(() => {
  stripeNow = null;
});

describe("billing webhook — applying events", () => {
  it("a good subscription event is applied: Pro, status, interval and period end stored", async () => {
    const db = fakeDb();
    const outcome = await handleStripeWebhook(
      { ...signed(subscriptionEvent("evt_3", "customer.subscription.created")), secret: SECRET, now: NOW },
      { store: db.store, fetchSubscription: fakeStripe },
    );
    expect(outcome.status).toBe(200);
    expect(db.users.get("user-1")!.plan).toBe("PRO");
    expect(db.billing.get("cus_known")!.update).toEqual({
      providerSubscriptionId: "sub_123",
      status: "active",
      interval: "month",
      currentPeriodEnd: new Date(PERIOD_END * 1000),
      cancelAtPeriodEnd: false,
    });
  });

  it("the same event delivered twice is applied once", async () => {
    const db = fakeDb();
    const setPlanCalls: PlanName[] = [];
    const event = signed(subscriptionEvent("evt_4", "customer.subscription.created"));

    const first = await handleStripeWebhook({ ...event, secret: SECRET, now: NOW }, { store: db.store, fetchSubscription: fakeStripe });
    setPlanCalls.push(db.users.get("user-1")!.plan);
    // Owner downgrades by hand in between: a replay must NOT flip it back.
    db.users.get("user-1")!.plan = "FREE";
    const second = await handleStripeWebhook({ ...event, secret: SECRET, now: NOW }, { store: db.store, fetchSubscription: fakeStripe });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ duplicate: true });
    expect(setPlanCalls).toEqual(["PRO"]);
    expect(db.users.get("user-1")!.plan).toBe("FREE");
  });

  it("an unknown event type → 200 and ignored (not even recorded)", async () => {
    const db = fakeDb();
    const outcome = await handleStripeWebhook(
      {
        ...signed({ id: "evt_5", object: "event", type: "charge.refunded", data: { object: {} } }),
        secret: SECRET,
        now: NOW,
      },
      { store: db.store, fetchSubscription: fakeStripe },
    );
    expect(outcome.status).toBe(200);
    expect(db.work).not.toHaveBeenCalled();
  });

  it("an event for a customer we don't know (e.g. a deleted account) → 200 and nothing changes", async () => {
    vi.spyOn(logger, "info").mockImplementation(() => {});
    const db = fakeDb();
    const outcome = await handleStripeWebhook(
      {
        ...signed(subscriptionEvent("evt_6", "customer.subscription.updated", { customer: "cus_stranger" })),
        secret: SECRET,
        now: NOW,
      },
      { store: db.store, fetchSubscription: fakeStripe },
    );
    expect(outcome.status).toBe(200);
    expect(db.users.get("user-1")!.plan).toBe("FREE");
    vi.restoreAllMocks();
  });

  it("subscription deleted → Free", async () => {
    const db = fakeDb();
    db.users.get("user-1")!.plan = "PRO";
    db.billing.get("cus_known")!.providerSubscriptionId = "sub_123";
    await handleStripeWebhook(
      {
        ...signed(subscriptionEvent("evt_7", "customer.subscription.deleted", { status: "canceled" })),
        secret: SECRET,
        now: NOW,
      },
      { store: db.store, fetchSubscription: fakeStripe },
    );
    expect(db.users.get("user-1")!.plan).toBe("FREE");
  });

  it("cancelled at period end keeps Pro until then", async () => {
    const db = fakeDb();
    await handleStripeWebhook(
      {
        ...signed(
          subscriptionEvent("evt_8", "customer.subscription.updated", { cancel_at_period_end: true }),
        ),
        secret: SECRET,
        now: NOW,
      },
      { store: db.store, fetchSubscription: fakeStripe },
    );
    expect(db.users.get("user-1")!.plan).toBe("PRO");
    expect(db.billing.get("cus_known")!.update!.cancelAtPeriodEnd).toBe(true);
  });

  it("checkout completed links the subscription only when client_reference_id matches the stored customer", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    const db = fakeDb();
    const checkout = (id: string, ref: string) => ({
      id,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          object: "checkout.session",
          customer: "cus_known",
          subscription: "sub_999",
          client_reference_id: ref,
        },
      },
    });
    await handleStripeWebhook(
      { ...signed(checkout("evt_9", "someone-else")), secret: SECRET, now: NOW },
      { store: db.store, fetchSubscription: fakeStripe },
    );
    expect(db.billing.get("cus_known")!.providerSubscriptionId).toBeNull();

    await handleStripeWebhook(
      { ...signed(checkout("evt_10", "user-1")), secret: SECRET, now: NOW },
      { store: db.store, fetchSubscription: fakeStripe },
    );
    expect(db.billing.get("cus_known")!.providerSubscriptionId).toBe("sub_999");
    // Checkout alone never grants Pro; only the subscription events do.
    expect(db.users.get("user-1")!.plan).toBe("FREE");
    vi.restoreAllMocks();
  });

  it("a failure on our side → 500 so Stripe retries, and the event id is not kept as done", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});
    const broken = fakeDb({ failOnApply: true });
    const event = signed(subscriptionEvent("evt_11", "customer.subscription.created"));
    const failed = await handleStripeWebhook({ ...event, secret: SECRET, now: NOW }, { store: broken.store, fetchSubscription: fakeStripe });
    expect(failed.status).toBe(500);
    expect(broken.events.has("evt_11")).toBe(false);
    vi.restoreAllMocks();
  });
});

describe("billing webhook — out-of-order events", () => {
  it("an older 'active' event arriving after a newer cancellation does not undo it", async () => {
    const db = fakeDb();
    db.users.get("user-1")!.plan = "PRO";
    db.billing.get("cus_known")!.providerSubscriptionId = "sub_123";
    // Stripe's truth now: cancelled and the paid period is over.
    stripeNow = {
      id: "sub_123",
      object: "subscription",
      customer: "cus_known",
      status: "canceled",
      cancel_at_period_end: false,
      cancel_at: null,
      items: {
        object: "list",
        data: [
          {
            current_period_end: Math.floor(NOW.getTime() / 1000) - 86400,
            price: { recurring: { interval: "month" } },
          },
        ],
      },
    };
    // The late, stale event still says "active".
    const late = subscriptionEvent("evt_old", "customer.subscription.updated", { status: "active" });
    const outcome = await handleStripeWebhook(
      { ...signed(late), secret: SECRET, now: NOW },
      { store: db.store, fetchSubscription: fakeStripe },
    );
    expect(outcome.status).toBe(200);
    expect(db.users.get("user-1")!.plan).toBe("FREE");
    expect(db.billing.get("cus_known")!.update!.status).toBe("canceled");
  });

  it("a failed Stripe lookup gives 500 so Stripe retries, and nothing is recorded", async () => {
    const db = fakeDb();
    const outcome = await handleStripeWebhook(
      { ...signed(subscriptionEvent("evt_x", "customer.subscription.updated")), secret: SECRET, now: NOW },
      {
        store: db.store,
        fetchSubscription: async () => {
          throw new Error("stripe down");
        },
      },
    );
    expect(outcome.status).toBe(500);
    expect(db.events.has("evt_x")).toBe(false);
  });

  it("an incomplete subscription never grants Pro, even with a future period end", async () => {
    const db = fakeDb();
    await handleStripeWebhook(
      {
        ...signed(subscriptionEvent("evt_inc", "customer.subscription.created", { status: "incomplete" })),
        secret: SECRET,
        now: NOW,
      },
      { store: db.store, fetchSubscription: fakeStripe },
    );
    expect(db.users.get("user-1")!.plan).toBe("FREE");
  });
});

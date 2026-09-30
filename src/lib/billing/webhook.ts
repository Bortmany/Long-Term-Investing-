// Stripe's billing events → our plan and subscription records (go-public
// spec B7). The route (src/app/api/billing/webhook/route.ts) stays thin; the
// rules live here so they can be unit-tested without a server:
//
//   1. Stripe's signature is checked with STRIPE_WEBHOOK_SECRET BEFORE
//      anything else. Missing or wrong → 400, a warning with no body and no
//      secret, and nothing changes.
//   2. The event id is recorded in BillingEvent first, inside the same
//      database transaction as the changes it causes. A repeat delivery hits
//      the already-recorded id and does nothing twice. If our side fails, the
//      whole transaction rolls back (id included) and we answer 500 so Stripe
//      retries.
//   3. Users are found ONLY by the Stripe customer id we stored when they
//      started checkout — never by anything else in the event. An event for a
//      customer we don't know (e.g. a deleted account) is ignored with 200.
//   4. Events we don't use are acknowledged with 200 and ignored.
//
// Never logged: the raw body, the signature header, or any key.

import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { resolveEffectivePlan } from "@/lib/plan-access";
import type { PlanName } from "@/lib/plans";

export type WebhookOutcome = { status: number; body: Record<string, unknown> };

export type StoredBillingRow = {
  userId: string;
  providerSubscriptionId: string | null;
};

export type SubscriptionUpdate = {
  providerSubscriptionId: string;
  status: string;
  interval: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

/** The database work one event may do — all inside one transaction. */
export type WebhookTx = {
  findByCustomerId: (customerId: string) => Promise<StoredBillingRow | null>;
  linkSubscription: (userId: string, providerSubscriptionId: string) => Promise<void>;
  updateSubscription: (userId: string, update: SubscriptionUpdate) => Promise<void>;
  setPlan: (userId: string, plan: PlanName) => Promise<void>;
};

export type WebhookStore = {
  /**
   * Record `eventId` and run `work` in ONE transaction. Returns "duplicate"
   * (without running `work`) when the id was already recorded.
   */
  runOnce: (
    eventId: string,
    type: string,
    work: (tx: WebhookTx) => Promise<void>,
  ) => Promise<"processed" | "duplicate">;
};

class DuplicateEventError extends Error {}

export const prismaWebhookStore: WebhookStore = {
  async runOnce(eventId, type, work) {
    try {
      await prisma.$transaction(async (db) => {
        try {
          await db.billingEvent.create({ data: { id: eventId, type } });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new DuplicateEventError();
          }
          throw error;
        }
        await work({
          findByCustomerId: (customerId) =>
            db.subscription.findFirst({
              where: { providerCustomerId: customerId },
              select: { userId: true, providerSubscriptionId: true },
            }),
          linkSubscription: async (userId, providerSubscriptionId) => {
            await db.subscription.update({ where: { userId }, data: { providerSubscriptionId } });
          },
          updateSubscription: async (userId, update) => {
            await db.subscription.update({ where: { userId }, data: update });
          },
          setPlan: async (userId, plan) => {
            await db.user.update({ where: { id: userId }, data: { plan } });
          },
        });
      });
      return "processed";
    } catch (error) {
      if (error instanceof DuplicateEventError) return "duplicate";
      throw error;
    }
  },
};

/** Stripe's customer field can be an id or an expanded object. */
function customerIdOf(customer: string | { id: string } | null | undefined): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

/** Period end and interval now live on the subscription's items (Stripe API 2025+). */
export function subscriptionUpdateFrom(sub: Stripe.Subscription): SubscriptionUpdate {
  const items = sub.items?.data ?? [];
  const periodEnds = items
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");
  const latestEnd = periodEnds.length > 0 ? Math.max(...periodEnds) : null;
  const interval = items[0]?.price?.recurring?.interval ?? "month";
  return {
    providerSubscriptionId: sub.id,
    status: sub.status,
    interval,
    currentPeriodEnd: latestEnd === null ? null : new Date(latestEnd * 1000),
    // The customer portal may cancel with a date rather than the flag.
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end) || sub.cancel_at != null,
  };
}

async function applyEvent(event: Stripe.Event, tx: WebhookTx, now: Date): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const customerId = customerIdOf(session.customer);
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!customerId || !subscriptionId) return;
      const row = await tx.findByCustomerId(customerId);
      if (!row) {
        logger.info("Billing event for an unknown customer was ignored", { eventId: event.id });
        return;
      }
      // client_reference_id was set by our own server; it must name the same
      // user the stored customer id belongs to, or we change nothing.
      if (session.client_reference_id && session.client_reference_id !== row.userId) {
        logger.warn("Checkout completion did not match its stored customer; ignored", {
          eventId: event.id,
        });
        return;
      }
      await tx.linkSubscription(row.userId, subscriptionId);
      // The plan itself is set by the subscription events, which carry the
      // status and period end.
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customerId = customerIdOf(sub.customer);
      if (!customerId) return;
      const row = await tx.findByCustomerId(customerId);
      if (!row) {
        logger.info("Billing event for an unknown customer was ignored", { eventId: event.id });
        return;
      }
      // An older, different subscription ending must not undo a newer one.
      if (
        event.type === "customer.subscription.deleted" &&
        row.providerSubscriptionId &&
        row.providerSubscriptionId !== sub.id
      ) {
        return;
      }
      const update = subscriptionUpdateFrom(sub);
      await tx.updateSubscription(row.userId, update);
      const plan: PlanName =
        event.type === "customer.subscription.deleted"
          ? "FREE"
          : resolveEffectivePlan({
              plan: "PRO",
              subscription: {
                status: update.status,
                currentPeriodEnd: update.currentPeriodEnd,
                providerSubscriptionId: update.providerSubscriptionId,
              },
              now,
            });
      await tx.setPlan(row.userId, plan);
      return;
    }

    case "invoice.payment_failed": {
      // Nothing to change here: Stripe follows up with a subscription update
      // (status past_due), which is what moves the Plans card.
      logger.warn("A subscription payment failed", { eventId: event.id });
      return;
    }

    default:
      return;
  }
}

const HANDLED_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

export async function handleStripeWebhook(
  params: { rawBody: string; signature: string | null; secret: string; now?: Date },
  deps: {
    store?: WebhookStore;
    constructEvent?: (rawBody: string, signature: string, secret: string) => Stripe.Event;
  } = {},
): Promise<WebhookOutcome> {
  const construct =
    deps.constructEvent ??
    ((rawBody: string, signature: string, secret: string) =>
      // Static helper: verifying needs only the webhook secret, no Stripe client.
      Stripe.webhooks.constructEvent(rawBody, signature, secret));
  const store = deps.store ?? prismaWebhookStore;

  // 1. Signature first, before anything else.
  if (!params.signature) {
    logger.warn("Billing webhook rejected: no signature");
    return { status: 400, body: { message: "Missing signature." } };
  }
  let event: Stripe.Event;
  try {
    event = construct(params.rawBody, params.signature, params.secret);
  } catch {
    logger.warn("Billing webhook rejected: the signature did not verify");
    return { status: 400, body: { message: "Invalid signature." } };
  }

  // 4. Unknown events: acknowledged, ignored, not even recorded.
  if (!HANDLED_TYPES.has(event.type)) {
    return { status: 200, body: { received: true, ignored: true } };
  }

  // 2 + 3. Record the id and apply the change in one transaction.
  try {
    const outcome = await store.runOnce(event.id, event.type, (tx) =>
      applyEvent(event, tx, params.now ?? new Date()),
    );
    return {
      status: 200,
      body: outcome === "duplicate" ? { received: true, duplicate: true } : { received: true },
    };
  } catch (error) {
    logger.error("Billing webhook could not be applied; Stripe will retry", {
      eventId: event.id,
      eventType: event.type,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { status: 500, body: { message: "Could not process this event right now." } };
  }
}

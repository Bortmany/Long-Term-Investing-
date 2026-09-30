// Upgrade (Stripe Checkout) and "Manage billing" (Stripe's customer portal).
//
// Both return a Stripe-hosted page URL; the browser then does a full-page
// navigation to it. No Stripe.js and no embedded form — the site's security
// policy only lets forms post to itself (next.config.ts, form-action 'self').
//
// Rules this file keeps (go-public spec B7):
//   - The price always comes from the server's environment; the client only
//     ever says "month" or "year".
//   - A Stripe customer is created with the user's EMAIL ONLY; the user id
//     goes into Stripe metadata and `client_reference_id`, nothing else.
//   - An idempotency key stops a double-click creating two checkouts.
//   - Returning to /settings?billing=success NEVER grants Pro. Only the
//     verified webhook (or the owner's plan:set command) changes a plan.
//   - The portal only ever opens for the customer id WE stored for this
//     user — never one taken from the browser.

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { StripeLike } from "@/lib/billing/stripe-client";
import {
  BILLING_OFF_MESSAGE,
  CHECKOUT_FAILED_MESSAGE,
  NO_BILLING_ACCOUNT_MESSAGE,
  PORTAL_FAILED_MESSAGE,
} from "@/lib/billing/messages";

export type CheckoutInterval = "month" | "year";

export type BillingUrlResult = { ok: true; url: string } | { ok: false; message: string };

/** What checkout and the portal need to know about a user's stored billing row. */
export type BillingAccountStore = {
  /** The Stripe customer id we stored for this user, or null. */
  getCustomerId: (userId: string) => Promise<string | null>;
  /**
   * Remember a freshly created Stripe customer for this user. Creates the
   * Subscription row with status "checkout_started" (no subscription yet);
   * the webhook fills in the real subscription later.
   */
  saveCustomerId: (userId: string, customerId: string, interval: CheckoutInterval) => Promise<void>;
};

export const prismaBillingAccountStore: BillingAccountStore = {
  async getCustomerId(userId) {
    const row = await prisma.subscription.findUnique({
      where: { userId },
      select: { providerCustomerId: true },
    });
    return row?.providerCustomerId ?? null;
  },
  async saveCustomerId(userId, customerId, interval) {
    await prisma.subscription.upsert({
      where: { userId },
      create: { userId, providerCustomerId: customerId, status: "checkout_started", interval },
      update: { providerCustomerId: customerId },
    });
  },
};

/** The site's public address, used for Stripe's return links. */
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.BETTER_AUTH_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

// A double-click (or a quick retry) inside the same 10-minute window reuses
// the same Checkout Session instead of creating a second one.
const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

export async function createCheckoutUrl(
  params: { userId: string; email: string; interval: CheckoutInterval; now?: Date },
  deps: {
    stripe: StripeLike | null;
    store?: BillingAccountStore;
    env?: Record<string, string | undefined>;
  },
): Promise<BillingUrlResult> {
  const env = deps.env ?? process.env;
  const store = deps.store ?? prismaBillingAccountStore;
  if (!deps.stripe) return { ok: false, message: BILLING_OFF_MESSAGE };
  const stripe = deps.stripe;

  const base = appBaseUrl(env);
  const priceId =
    params.interval === "year" ? env.STRIPE_PRICE_PRO_YEARLY : env.STRIPE_PRICE_PRO_MONTHLY;
  if (!base || !priceId) {
    logger.error("Checkout could not start: the site address or a price id is missing");
    return { ok: false, message: CHECKOUT_FAILED_MESSAGE };
  }

  const now = params.now ?? new Date();
  const windowStart = Math.floor(now.getTime() / IDEMPOTENCY_WINDOW_MS);

  try {
    let customerId = await store.getCustomerId(params.userId);
    if (!customerId) {
      const customer = await stripe.customers.create(
        // Email ONLY — plus our own user id so the customer can be traced back.
        { email: params.email, metadata: { userId: params.userId } },
        { idempotencyKey: `investiq-customer-${params.userId}` },
      );
      customerId = customer.id;
      await store.saveCustomerId(params.userId, customerId, params.interval);
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        client_reference_id: params.userId,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { userId: params.userId },
        subscription_data: { metadata: { userId: params.userId } },
        success_url: `${base}/settings?billing=success`,
        cancel_url: `${base}/settings?billing=cancelled`,
      },
      {
        idempotencyKey: `investiq-checkout-${params.userId}-${params.interval}-${windowStart}`,
      },
    );
    if (!session.url) {
      logger.error("Checkout session came back without a page address");
      return { ok: false, message: CHECKOUT_FAILED_MESSAGE };
    }
    return { ok: true, url: session.url };
  } catch (error) {
    logger.error("Checkout could not start", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { ok: false, message: CHECKOUT_FAILED_MESSAGE };
  }
}

export async function createPortalUrl(
  params: { userId: string },
  deps: {
    stripe: StripeLike | null;
    store?: BillingAccountStore;
    env?: Record<string, string | undefined>;
  },
): Promise<BillingUrlResult> {
  const env = deps.env ?? process.env;
  const store = deps.store ?? prismaBillingAccountStore;
  if (!deps.stripe) return { ok: false, message: BILLING_OFF_MESSAGE };

  const base = appBaseUrl(env);
  if (!base) {
    logger.error("Billing page could not open: the site address is missing");
    return { ok: false, message: PORTAL_FAILED_MESSAGE };
  }

  try {
    // Only ever the customer id we stored for THIS signed-in user.
    const customerId = await store.getCustomerId(params.userId);
    if (!customerId) return { ok: false, message: NO_BILLING_ACCOUNT_MESSAGE };
    const session = await deps.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${base}/settings#plans`,
    });
    return { ok: true, url: session.url };
  } catch (error) {
    logger.error("Billing page could not open", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { ok: false, message: PORTAL_FAILED_MESSAGE };
  }
}

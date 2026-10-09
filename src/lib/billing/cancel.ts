// Cancel a paying user's Stripe subscription before their account is deleted
// (go-public spec B7). A silent success here would keep billing someone
// whose account no longer exists, so a failure STOPS the deletion.
//
// Billing off → no Stripe call at all (and nothing to cancel: a subscription
// can only exist once billing has been on).

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { StripeLike } from "@/lib/billing/stripe-client";

// Subscriptions in these states are already over — nothing to cancel.
const FINISHED_STATUSES = new Set(["canceled", "incomplete_expired"]);

export type CancelOutcome =
  | { ok: true; cancelled: boolean }
  | { ok: false };

export type CancelStore = {
  /** The stored Stripe subscription for this user, or null. */
  getSubscription: (
    userId: string,
  ) => Promise<{ providerSubscriptionId: string | null; status: string } | null>;
};

export const prismaCancelStore: CancelStore = {
  getSubscription: (userId) =>
    prisma.subscription.findUnique({
      where: { userId },
      select: { providerSubscriptionId: true, status: true },
    }),
};

/** Does this user have a live subscription that must be cancelled first? */
export async function needsCancelBeforeDelete(
  userId: string,
  deps: { stripe: StripeLike | null; store?: CancelStore },
): Promise<boolean> {
  if (!deps.stripe) return false;
  try {
    const row = await (deps.store ?? prismaCancelStore).getSubscription(userId);
    return Boolean(row?.providerSubscriptionId && !FINISHED_STATUSES.has(row.status));
  } catch {
    // Can't tell — play safe: go through the cancel step, which will fail
    // honestly (and stop the deletion) if the database is still unreachable.
    return true;
  }
}

export async function cancelSubscriptionBeforeDelete(
  userId: string,
  deps: { stripe: StripeLike | null; store?: CancelStore },
): Promise<CancelOutcome> {
  if (!deps.stripe) return { ok: true, cancelled: false };
  const store = deps.store ?? prismaCancelStore;

  try {
    const row = await store.getSubscription(userId);
    if (!row?.providerSubscriptionId || FINISHED_STATUSES.has(row.status)) {
      return { ok: true, cancelled: false };
    }
    // Immediately, not at period end: the account is about to disappear.
    await deps.stripe.subscriptions.cancel(row.providerSubscriptionId);
    return { ok: true, cancelled: true };
  } catch (error) {
    logger.error("Could not cancel a subscription before account deletion", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { ok: false };
  }
}

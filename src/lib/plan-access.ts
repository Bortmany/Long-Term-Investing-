// Who is on Pro? The one place every plan gate asks (go-public spec B1).
//
// The stored `User.plan` is the source, but `resolveEffectivePlan` decides
// what the app actually treats someone as, so a missed payment webhook can
// never leave a lapsed subscriber on Pro forever:
//
//   - PRO with no real Stripe subscription  -> owner-granted Pro (set with
//     `npm run plan:set`); stays Pro until the owner changes it.
//   - PRO with a Stripe subscription         -> Pro while it is active, trialing
//     or past due (with a short grace for a late renewal webhook), or while a
//     CANCELLED subscription's paid period hasn't ended yet.
//   - anything else (incomplete, incomplete_expired, unpaid, paused)
//                                            -> Free.
//
// Gates are enforced HERE, in server code (actions, the cron sweep, the alert
// engine) — never only by hiding a button. Downgrading never hides or deletes
// anything already saved; it only stops creating new Pro things.

import { prisma } from "@/lib/prisma";
import { isBillingEnabled } from "@/lib/billing/config";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import type { PlanName } from "@/lib/plans";

/** The subscription fields the plan decision reads. */
export type SubscriptionSnapshot = {
  status: string;
  currentPeriodEnd: Date | null;
  /** Null while only a Stripe customer exists (checkout started, never finished). */
  providerSubscriptionId: string | null;
};

// Stripe statuses where the customer is (still) paying for the current period.
const PAYING_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * How long after the recorded period end an "active" subscription is still
 * trusted. Stripe renews on its own and tells us by webhook; if that one
 * renewal message is late or lost, this keeps a paying customer on Pro for a
 * few days instead of dropping them the minute the old period ends.
 */
export const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export function resolveEffectivePlan({
  plan,
  subscription,
  now,
}: {
  plan: PlanName;
  subscription: SubscriptionSnapshot | null;
  now: Date;
}): PlanName {
  if (plan !== "PRO") return "FREE";

  // No real subscription behind it: the owner granted Pro by hand.
  if (!subscription || !subscription.providerSubscriptionId) return "PRO";

  const periodEnd = subscription.currentPeriodEnd;
  if (PAYING_STATUSES.has(subscription.status)) {
    if (!periodEnd) return "PRO";
    return periodEnd.getTime() + RENEWAL_GRACE_MS > now.getTime() ? "PRO" : "FREE";
  }

  // Cancelled: Pro only until the paid period ends.
  if (subscription.status === "canceled") {
    return periodEnd && periodEnd.getTime() > now.getTime() ? "PRO" : "FREE";
  }

  // incomplete, incomplete_expired, unpaid, paused, anything unknown: nothing
  // was paid for, whatever the period end says.
  return "FREE";
}

// ---------------------------------------------------------------------------
// Database-backed helpers (always scoped to one user id from the session or a
// trusted server loop — never a client-supplied id).
// ---------------------------------------------------------------------------

export type PlanStatus = {
  /** What the app treats this person as right now. */
  plan: PlanName;
  /** What is stored on the user row. */
  storedPlan: PlanName;
  /** True when Pro was granted by the owner (no Stripe subscription behind it). */
  ownerGranted: boolean;
  subscription: {
    status: string;
    interval: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

/** Plan plus subscription details for the Settings card. Throws if the database can't be read. */
export async function getPlanStatus(userId: string, now: Date = new Date()): Promise<PlanStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      subscription: {
        select: {
          status: true,
          interval: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          providerSubscriptionId: true,
        },
      },
    },
  });
  if (!user) {
    return { plan: "FREE", storedPlan: "FREE", ownerGranted: false, subscription: null };
  }
  const sub = user.subscription;
  const realSubscription = sub && sub.providerSubscriptionId ? sub : null;
  const plan = resolveEffectivePlan({ plan: user.plan, subscription: sub, now });
  return {
    plan,
    storedPlan: user.plan,
    ownerGranted: user.plan === "PRO" && !realSubscription,
    subscription: realSubscription
      ? {
          status: realSubscription.status,
          interval: realSubscription.interval,
          currentPeriodEnd: realSubscription.currentPeriodEnd,
          cancelAtPeriodEnd: realSubscription.cancelAtPeriodEnd,
        }
      : null,
  };
}

/** The plan the app treats this user as right now. Throws if the database can't be read. */
export async function getUserPlan(userId: string, now: Date = new Date()): Promise<PlanName> {
  return (await getPlanStatus(userId, now)).plan;
}

export async function isPro(userId: string, now: Date = new Date()): Promise<boolean> {
  return (await getUserPlan(userId, now)) === "PRO";
}

/** The names each Pro gate uses in its "part of Pro" sentence (singular, so "is" reads right). */
export const PRO_FEATURE_LABELS = {
  committee: "The full Investment Committee",
  thesisCheck: "The AI thesis check-up",
  weeklyReview: "The weekly AI review",
  reviewAlert: "A \"time to review\" alert",
} as const;

/**
 * The standard "part of Pro" sentence. `featureLabel` names the thing, e.g.
 * "The Investment Committee". Whole sentences, never glued fragments.
 */
export function proRequiredMessage(featureLabel: string, billingEnabled: boolean): string {
  return billingEnabled
    ? `${featureLabel} is part of Pro. You can upgrade in Settings, under Plans & billing. ` +
        "Everything you've already saved is still here."
    : `${featureLabel} is part of Pro, which is coming soon. ` +
        "Everything you've already saved is still here.";
}

/**
 * The server-side gate for a Pro-only action. Returns ok for a Pro user, or
 * an action failure (code "PRO_REQUIRED") with the standard sentence.
 */
export async function requirePro(
  userId: string,
  featureLabel: string,
  deps: { isProFn?: (userId: string) => Promise<boolean>; billingEnabled?: boolean } = {},
): Promise<ActionResult<null>> {
  const check = deps.isProFn ?? isPro;
  if (await check(userId)) return actionOk(null);
  const billingOn = deps.billingEnabled ?? isBillingEnabled();
  return actionError(proRequiredMessage(featureLabel, billingOn), { code: "PRO_REQUIRED" });
}

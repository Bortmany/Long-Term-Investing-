"use server";

// Upgrade and Manage billing (go-public spec B7), always for the signed-in
// user from the server session — never an id, price or customer from the
// browser. Both return a Stripe-hosted page address; the Plans card then
// sends the whole browser there (a full-page navigation, no embedded form).
//
// While billing is off both simply answer "Payments aren't turned on yet."
// and no Stripe object is ever created.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getSessionUserId } from "@/lib/user-portfolio";
import { BILLING_ACTION_RATE_LIMIT, rateLimit, rateLimitMessage, userKey } from "@/lib/rate-limit";
import { isBillingEnabled } from "@/lib/billing/config";
import { getStripe } from "@/lib/billing/stripe-client";
import { createCheckoutUrl, createPortalUrl } from "@/lib/billing/checkout";
import { ALREADY_PRO_MESSAGE, BILLING_OFF_MESSAGE } from "@/lib/billing/messages";
import { isPro } from "@/lib/plan-access";

const intervalSchema = z.enum(["month", "year"], {
  error: "Choose monthly or yearly.",
});

export async function startCheckout(interval: string): Promise<ActionResult<{ url: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  if (!isBillingEnabled()) return actionError(BILLING_OFF_MESSAGE);

  const limited = rateLimit(userKey("billing-action", userId), BILLING_ACTION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsed = intervalSchema.safeParse(interval);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Choose monthly or yearly.");
  }

  if (await isPro(userId)) return actionError(ALREADY_PRO_MESSAGE);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return actionError(NOT_SIGNED_IN_ERROR);

  const result = await createCheckoutUrl(
    { userId, email: user.email, interval: parsed.data },
    { stripe: getStripe() },
  );
  return result.ok ? actionOk({ url: result.url }) : actionError(result.message);
}

export async function openBillingPortal(): Promise<ActionResult<{ url: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  if (!isBillingEnabled()) return actionError(BILLING_OFF_MESSAGE);

  const limited = rateLimit(userKey("billing-action", userId), BILLING_ACTION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const result = await createPortalUrl({ userId }, { stripe: getStripe() });
  return result.ok ? actionOk({ url: result.url }) : actionError(result.message);
}

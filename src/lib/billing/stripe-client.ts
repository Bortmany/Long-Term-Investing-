// The ONE place a Stripe client is ever built — and only while billing is
// switched on (src/lib/billing/config.ts). While billing is off this returns
// null without touching the Stripe package's constructor, so no Stripe object
// exists and no network request can go to Stripe.
//
// STRIPE_SECRET_KEY is read here and handed straight to the SDK. It is never
// logged, returned, or put in an error message.

import Stripe from "stripe";
import { isBillingEnabled } from "@/lib/billing/config";

/** The small slice of the Stripe SDK this app uses — tests pass a fake with the same shape. */
export type StripeLike = {
  customers: Pick<Stripe["customers"], "create">;
  checkout: { sessions: Pick<Stripe["checkout"]["sessions"], "create"> };
  billingPortal: { sessions: Pick<Stripe["billingPortal"]["sessions"], "create"> };
  subscriptions: Pick<Stripe["subscriptions"], "cancel" | "retrieve">;
};

let cached: { key: string; client: Stripe } | null = null;

/** The Stripe client, or null while billing is off. */
export function getStripe(env: Record<string, string | undefined> = process.env): StripeLike | null {
  if (!isBillingEnabled(env)) return null;
  const key = env.STRIPE_SECRET_KEY!;
  if (!cached || cached.key !== key) {
    cached = {
      key,
      client: new Stripe(key, {
        appInfo: { name: "InvestIQ AI" },
        // A slow Stripe must never hang a click for long.
        timeout: 20_000,
        maxNetworkRetries: 1,
      }),
    };
  }
  return cached.client;
}

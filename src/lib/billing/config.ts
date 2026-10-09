// Is taking payments switched on? Billing is built but OFF by default: it is
// only on when the owner sets BILLING_ENABLED="true" AND all four Stripe
// values. Anything less means "dormant" — no upgrade buttons, no checkout,
// and the webhook answers a dormant 503.
//
// Pure: reads the environment only. Never logs or returns a key.

import { logger } from "@/lib/logger";

export type BillingMode = "dormant" | "test" | "live";

type Env = Record<string, string | undefined>;

const REQUIRED_STRIPE_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_YEARLY",
] as const;

let warnedLiveKeyOutsideProduction = false;

export function getBillingMode(env: Env = process.env): BillingMode {
  if (env.BILLING_ENABLED !== "true") return "dormant";
  for (const name of REQUIRED_STRIPE_VARS) {
    if (!env[name] || env[name]!.trim() === "") return "dormant";
  }
  const key = env.STRIPE_SECRET_KEY!;
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) {
    // A live key on a tester's machine must never charge a real card.
    if (env.NODE_ENV !== "production") {
      if (!warnedLiveKeyOutsideProduction) {
        warnedLiveKeyOutsideProduction = true;
        logger.warn("A live Stripe key is set outside production; billing stays off.");
      }
      return "dormant";
    }
    return "live";
  }
  return "dormant";
}

export function isBillingEnabled(env: Env = process.env): boolean {
  return getBillingMode(env) !== "dormant";
}

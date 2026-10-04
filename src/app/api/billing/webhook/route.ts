// Stripe's billing webhook — POST /api/billing/webhook (go-public spec B5/B7).
// Public on purpose (src/proxy.ts lists this exact path): Stripe can't send a
// session cookie, so the proof it's really Stripe is the signature check in
// src/lib/billing/webhook.ts, which runs before anything else.
//
// While billing is OFF this answers 503 "dormant" straight away — without
// reading the request body and without creating any Stripe object — the
// same honest "switched off" pattern the cron routes use.

import { NextResponse } from "next/server";
import { isBillingEnabled } from "@/lib/billing/config";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { WEBHOOK_DORMANT_MESSAGE } from "@/lib/billing/messages";
import { getClientIp, ipKey, rateLimit, rateLimitMessage } from "@/lib/rate-limit";

// Generous so Stripe's own bursts and retries are never blocked, but bounded
// so a flood of junk requests can't make us do unlimited signature checks.
const BILLING_WEBHOOK_RATE_LIMIT = { limit: 300, windowMs: 60_000 };

export async function POST(request: Request): Promise<Response> {
  if (!isBillingEnabled()) {
    return NextResponse.json(
      { status: "dormant", message: WEBHOOK_DORMANT_MESSAGE },
      { status: 503 },
    );
  }

  const ip = getClientIp(request.headers);
  const limited = rateLimit(ipKey("billing-webhook", ip), BILLING_WEBHOOK_RATE_LIMIT);
  if (!limited.ok) {
    return NextResponse.json(
      { message: rateLimitMessage(limited.retryAfterSeconds) },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  // The signature covers the exact bytes Stripe sent, so read the raw text —
  // never a parsed-and-re-serialised body.
  const rawBody = await request.text();
  const outcome = await handleStripeWebhook({
    rawBody,
    signature: request.headers.get("stripe-signature"),
    secret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  });
  return NextResponse.json(outcome.body, { status: outcome.status });
}

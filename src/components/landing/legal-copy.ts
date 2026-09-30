// Fixed sentences for the public /terms page, kept here (not in the page file)
// so tests can check them without rendering: the refund line must match
// docs/decisions/usd-payments.md word for word, and the payment-status
// sentence must follow the live billing flag.

import { PLAN_LIMITS, PRICING } from "@/lib/plans";
import { formatUsd } from "@/components/landing/landing-copy";

/** Verbatim from docs/decisions/usd-payments.md ("Refund line for the terms"). */
export const REFUND_LINE =
  "You can cancel Pro at any time from Manage billing and keep Pro until the end of the period you paid for; if you're not satisfied, ask within 14 days of any payment for a full refund of that payment. Payments are handled by Stripe (shown as 'Link') as our reseller, which may also issue refunds where the law requires.";

export const TERMS_POSITIONING_SENTENCE =
  "InvestIQ is portfolio tracking and research software, not personalised advice.";

export const PRO_NOT_ON_SALE_TERMS = "Pro is not on sale yet. When it opens, the terms below apply.";
export const PRO_ON_SALE_TERMS = "These terms apply to Pro.";

/** The payment-status sentence on /terms. Never claims Pro is on sale while billing is off. */
export function termsPaymentStatusSentence(billingEnabled: boolean): string {
  return billingEnabled ? PRO_ON_SALE_TERMS : PRO_NOT_ON_SALE_TERMS;
}

/** "$9.99 a month or $89 a year", read from PRICING. */
export function proPriceSentence(): string {
  return `${formatUsd(PRICING.proMonthlyUsd)} a month or ${formatUsd(PRICING.proYearlyUsd)} a year`;
}

/** The fair-use sentence about AI limits, with the numbers read from PLAN_LIMITS. */
export function aiFairUseSentence(): string {
  return (
    "AI limits exist to keep the service affordable for everyone. " +
    `Free includes ${PLAN_LIMITS.FREE.dailyAi} new AI analyses per UTC day. ` +
    `Pro includes ${PLAN_LIMITS.PRO.dailyAi} new AI analyses per UTC day, up to ` +
    `${PLAN_LIMITS.PRO.monthlyAi} per UTC calendar month. ` +
    "The whole service also has a daily limit across all users. " +
    "Analyses you have already saved always stay viewable, whatever your plan or limit."
  );
}

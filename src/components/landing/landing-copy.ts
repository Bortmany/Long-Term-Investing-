// The words and plan-card contents for the public landing page, kept as pure
// data and small pure functions so they can be unit-tested without rendering
// the page (tests/unit/legal-and-landing.test.ts).
//
// Golden rule: every price and limit here is read from src/lib/plans.ts
// (PRICING, PLAN_LIMITS, PLAN_FEATURES) — nothing is typed in by hand — and
// nothing here ever says payments are live while billing is off.

import type { SignUpStatus } from "@/lib/auth";
import { PLAN_FEATURES, PLAN_LIMITS, PRICING, type PlanName } from "@/lib/plans";

/** The one-sentence description of what InvestIQ is (hero, metadata, footer). */
export const POSITIONING_LINE =
  "Portfolio tracking and research software, not personalised advice.";

export const SIGNUPS_PAUSED_LINE = "New sign-ups are paused right now.";
export const FREE_TO_START_LINE = "Free to start. No card needed.";

/**
 * Reads the sign-up status, but never lets a failure turn into a broken
 * "Create free account" button: if the status can't be read, the page shows
 * the paused version (Sign in only).
 */
export function readSignUpStatusSafely(read: () => SignUpStatus): SignUpStatus {
  try {
    return read();
  } catch {
    return { open: false, reason: "paused" };
  }
}

/** Same idea for the billing flag: if it can't be read, treat billing as OFF. */
export function readBillingEnabledSafely(read: () => boolean): boolean {
  try {
    return read() === true;
  } catch {
    return false;
  }
}

/** "$9.99" for 9.99, "$89" for 89. US dollars, Western digits. */
export function formatUsd(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/** How much cheaper a year of Pro is than twelve months, rounded to a whole %. */
export function yearlySavingsPercent(): number {
  const twelveMonths = PRICING.proMonthlyUsd * 12;
  return Math.round((1 - PRICING.proYearlyUsd / twelveMonths) * 100);
}

export interface PlanFeatureRow {
  key: string;
  label: string;
  comingLater: boolean;
}

/** One plan's feature rows, from PLAN_FEATURES: available ones first, then "coming later" ones. */
export function featureRowsFor(plan: PlanName): PlanFeatureRow[] {
  const rows = PLAN_FEATURES.filter((feature) => feature.plan === plan).map((feature) => ({
    key: feature.key,
    label: feature.label,
    comingLater: feature.status === "coming_soon",
  }));
  return [...rows.filter((row) => !row.comingLater), ...rows.filter((row) => row.comingLater)];
}

/** What sits at the bottom of a plan card: a sign-up button, or a muted line. */
export type PlanCardAction =
  | { kind: "sign-up-button"; label: string; href: string }
  | { kind: "line"; text: string };

export interface PlanCardModel {
  plan: PlanName;
  name: string;
  price: string;
  priceSuffix: string | null;
  priceNote: string;
  tag: string | null;
  leadLine: string | null;
  features: PlanFeatureRow[];
  // Thin slate frame, or the stronger blue one (Pro only, and only once Pro is on sale).
  emphasised: boolean;
  action: PlanCardAction;
}

export interface PlansSectionModel {
  heading: string;
  subLine: string;
  cards: [PlanCardModel, PlanCardModel];
  footnotes: string[];
}

export const CREATE_FREE_ACCOUNT = "Create free account";
export const PRO_NOT_ON_SALE_LINE = "Not on sale yet. It will appear in Settings when it opens.";
export const PRO_ON_SALE_LINE = "Create a free account first, then upgrade in Settings.";
export const PRO_ON_SALE_SIGNUPS_PAUSED_LINE = "Already have an account? Upgrade in Settings.";
export const COMING_SOON_TAG = "Coming soon";
export const COMING_LATER_BADGE = "Coming later";

/**
 * Everything the Plans section shows, for a given billing state and sign-up
 * state. There is never a purchase button here: checkout needs an account,
 * so it only ever happens in Settings.
 */
export function buildPlansSection(input: {
  billingEnabled: boolean;
  signUpStatus: SignUpStatus;
}): PlansSectionModel {
  const { billingEnabled, signUpStatus } = input;

  const free: PlanCardModel = {
    plan: "FREE",
    name: "Free",
    price: formatUsd(0),
    priceSuffix: null,
    priceNote: "No card needed",
    tag: null,
    leadLine: null,
    features: featureRowsFor("FREE"),
    emphasised: false,
    action: signUpStatus.open
      ? { kind: "sign-up-button", label: CREATE_FREE_ACCOUNT, href: "/sign-up" }
      : { kind: "line", text: SIGNUPS_PAUSED_LINE },
  };

  const pro: PlanCardModel = {
    plan: "PRO",
    name: "Pro",
    price: formatUsd(PRICING.proMonthlyUsd),
    priceSuffix: "/ month",
    priceNote: `or ${formatUsd(PRICING.proYearlyUsd)} / year (about ${yearlySavingsPercent()}% less)`,
    tag: billingEnabled ? null : COMING_SOON_TAG,
    leadLine: "Everything in Free, plus:",
    features: featureRowsFor("PRO"),
    emphasised: billingEnabled,
    action: {
      kind: "line",
      text: !billingEnabled
        ? PRO_NOT_ON_SALE_LINE
        : signUpStatus.open
          ? PRO_ON_SALE_LINE
          : PRO_ON_SALE_SIGNUPS_PAUSED_LINE,
    },
  };

  return {
    heading: billingEnabled
      ? "Start free. Upgrade when you're ready."
      : "Start free. Pro is coming soon.",
    subLine: billingEnabled
      ? "Start free, upgrade any time in Settings."
      : "Pro isn't on sale yet. Everything in Free works today.",
    cards: [free, pro],
    footnotes: [
      `Free: ${PLAN_LIMITS.FREE.dailyAi} new AI analyses a day. Pro: ${PLAN_LIMITS.PRO.dailyAi} a day.`,
      "Data download and account deletion are free on every plan.",
      "Prices are in US dollars. AI limits reset at midnight UTC.",
    ],
  };
}

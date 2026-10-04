// EVERY user-facing sentence for the Sharia screen lives here, as whole
// sentences (never glued from fragments), so an Arabic version can be added
// later without hunting through components. No religious shorthand ("halal",
// "haram") anywhere. The fatwa sentence should be checked by a scholar or
// lawyer before any translation.

import type { NotScreenedReason, ShariaState } from "./types";

export const BADGE_LABELS: Record<ShariaState, string> = {
  compliant: "Compliant",
  not_compliant: "Not compliant",
  not_screened: "Not screened",
};

export const BADGE_ACCESSIBLE_NAMES: Record<ShariaState, string> = {
  compliant: "Sharia screen: Compliant. Show details.",
  not_compliant: "Sharia screen: Not compliant. Show details.",
  not_screened: "Sharia screen: Not screened. Show details.",
};

export const BADGE_HOVER_HINT = "How this was screened";
export const PANEL_CAPTION = "Sharia screen";
export const PANEL_GOT_IT = "Got it";
export const PANEL_CLOSE = "Close";
export const NEVER_GUESS = "We never guess a result.";

/** The decision's fixed wording, with the method and supplier named. */
export function methodSentence(input: {
  methodName: string;
  methodVersion: string;
  vendorName: string;
  checkedLabel: string;
}): string {
  const version = input.methodVersion ? ` ${input.methodVersion}` : "";
  return (
    `Screen per ${input.methodName}${version}, supplied by ${input.vendorName}, ` +
    `checked ${input.checkedLabel}. This is an automated screen, not a religious ruling (fatwa). ` +
    "Different scholars and methods can reach different results. Ask a qualified scholar if unsure."
  );
}

export function fetchedSentence(vendorName: string, fetchedLabel: string): string {
  return `Fetched from ${vendorName} on ${fetchedLabel}.`;
}

export function notScreenedReasonText(
  reason: NotScreenedReason,
  input: { exchangeName: string; checkedLabel?: string },
): string {
  switch (reason) {
    case "not_set_up":
      return "Sharia screening isn't switched on for this server yet.";
    case "not_covered":
      return `Our screening source doesn't cover ${input.exchangeName} stocks yet.`;
    case "no_verdict":
      return "Our screening source has no verdict for this stock.";
    case "too_old":
      return (
        `The last verdict we have is from ${input.checkedLabel ?? "an earlier date"}, ` +
        "more than 100 days ago, so we're not showing it."
      );
  }
}

// --- Settings card ----------------------------------------------------------
export const CARD_TITLE = "Sharia screen";
export const CARD_LABEL = "Show the Sharia screen badge on stocks";
export const CARD_EXPLANATION =
  "Off by default. When on, each stock shows Compliant, Not compliant or Not screened, " +
  "with the method and source one tap away. This is an automated screen supplied by a data " +
  "company, not a religious ruling (fatwa).";
export const CARD_PRIVACY = "Your choice is private to your account. It is never sent to the data company.";
export const CARD_NOT_SET_UP =
  "Screening isn't switched on for this server yet, so every stock will show \"Not screened\" for now.";
export const CARD_PRO_COMING_SOON = "The Sharia screen is part of Pro, which is coming soon.";
export const CARD_PRO = "The Sharia screen is part of Pro.";
export const CARD_PAUSED =
  "You turned this on while you had Pro. It is paused and will come back if you upgrade.";
export const CARD_SAVING = "Saving…";
export const CARD_SAVED_ON = "Saved. The Sharia screen badge is now on.";
export const CARD_SAVED_OFF = "Saved. The badge is off and hidden everywhere.";
export const CARD_FETCHING =
  "Fetching screening results for your stocks now. This can take a minute. Badges fill in as results arrive.";
export const CARD_ALREADY_HAVE = "Your stocks already have their results.";
export const CARD_NOTHING_HELD = "Add a stock to your portfolio or watchlist to see its badge.";
export const CARD_TONIGHT = "Results will arrive with tonight's update.";
export const CARD_ERROR_SERVER = "Something went wrong on our side. Nothing was changed. Please try again.";
export const CARD_ERROR_SIGN_IN = "Please sign in again to change this.";
export const CARD_ERROR_RATE = "You're changing this too quickly. Please wait a minute and try again.";

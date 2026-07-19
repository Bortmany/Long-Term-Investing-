// Pure alert-evaluation functions (BUILD-PLAN.md Phase 7). No I/O here —
// everything takes plain data the caller (src/lib/alerts/engine.ts) already
// fetched and returns a typed fire/no-fire result. Same house style as
// src/lib/theses/checks.ts and src/lib/stocks/ratios.ts.
//
// THE CORE GUARANTEE, baked into evaluatePriceAlert itself (not left to the
// engine to remember): a quote sourced from seeded demo data NEVER fires an
// alert, no matter how far past the threshold it is. Alerts only ever fire on
// live or manually entered prices — the same golden-rule discipline every
// other screen in this app follows.
import { formatMoney, formatShortDate } from "@/lib/format";

export type AlertFireResult =
  | { fired: true; title: string; body: string }
  | { fired: false; outcome: string };

// ---------------------------------------------------------------------------
// Price alerts: PRICE_ABOVE / PRICE_BELOW / DAY_DROP
// ---------------------------------------------------------------------------

export type PriceAlertKind = "PRICE_ABOVE" | "PRICE_BELOW" | "DAY_DROP";

/** The minimal alert shape needed to evaluate a price-kind alert. */
export type PriceAlertForEval = {
  kind: PriceAlertKind;
  /** Price in the instrument's own currency (PRICE_ABOVE/PRICE_BELOW), or a positive percent (DAY_DROP). */
  threshold: number;
  ticker: string;
};

/** The received quote, trimmed to what evaluation needs. */
export type PriceAlertQuote = {
  price: number;
  currency: string;
  /** When the price is FOR (market timestamp). */
  asOf: Date;
  /** "sample" = seeded demo data. See THE CORE GUARANTEE above. */
  source: "live" | "manual" | "sample";
};

export type PriceAlertInput = {
  quote: PriceAlertQuote;
  /** Newest PriceCache row strictly before the quote's calendar day, or null if none exists yet. */
  previousClose: { price: number; asOf: Date } | null;
};

/**
 * Evaluate one PRICE_ABOVE / PRICE_BELOW / DAY_DROP alert against a received
 * quote. Threshold compares are INCLUSIVE (a price exactly at the threshold
 * fires). Titles/bodies embed only the real received price, via formatMoney
 * and formatShortDate — never a fabricated figure.
 */
export function evaluatePriceAlert(
  alert: PriceAlertForEval,
  price: PriceAlertInput,
  now: Date,
): AlertFireResult {
  // THE CORE GUARANTEE: sample data never fires, no matter what.
  if (price.quote.source === "sample") {
    return {
      fired: false,
      outcome: "Not checked — only sample data is available for this stock.",
    };
  }

  const { quote } = price;
  const moneyNow = formatMoney(quote.price, quote.currency);
  const dateNow = formatShortDate(quote.asOf);
  void now; // reserved for future "how long has this been true" wording; not needed yet.

  switch (alert.kind) {
    case "PRICE_ABOVE": {
      const thresholdLabel = formatMoney(alert.threshold, quote.currency);
      if (quote.price >= alert.threshold) {
        return {
          fired: true,
          title: `${alert.ticker} rose above ${thresholdLabel}`,
          body: `${alert.ticker} is now ${moneyNow} as of ${dateNow}.`,
        };
      }
      return {
        fired: false,
        outcome: `Checked — ${moneyNow} as of ${dateNow}, still below ${thresholdLabel}.`,
      };
    }
    case "PRICE_BELOW": {
      const thresholdLabel = formatMoney(alert.threshold, quote.currency);
      if (quote.price <= alert.threshold) {
        return {
          fired: true,
          title: `${alert.ticker} fell below ${thresholdLabel}`,
          body: `${alert.ticker} is now ${moneyNow} as of ${dateNow}.`,
        };
      }
      return {
        fired: false,
        outcome: `Checked — ${moneyNow} as of ${dateNow}, still above ${thresholdLabel}.`,
      };
    }
    case "DAY_DROP": {
      if (!price.previousClose || price.previousClose.price <= 0) {
        return {
          fired: false,
          outcome:
            "Not checked — no previous closing price is available yet to compare against.",
        };
      }
      const prevPrice = price.previousClose.price;
      const dropPct = ((prevPrice - quote.price) / prevPrice) * 100;
      if (dropPct >= alert.threshold) {
        return {
          fired: true,
          title: `${alert.ticker} dropped ${dropPct.toFixed(1)}% today`,
          body: `${alert.ticker} is now ${moneyNow} as of ${dateNow}, down from ${formatMoney(prevPrice, quote.currency)}.`,
        };
      }
      const shownDrop = Math.max(dropPct, 0).toFixed(1);
      return {
        fired: false,
        outcome: `Checked — down ${shownDrop}% today, below the ${alert.threshold}% threshold.`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Thesis alerts: THESIS_REVIEW_DUE
// ---------------------------------------------------------------------------

export type ThesisAlertForEval = {
  intervalDays: number;
  ticker: string;
};

export type ThesisAlertInput = {
  /** The most recent ThesisCheck.createdAt for this thesis, or null if it has never been checked. */
  lastCheckedAt: Date | null;
  /** When the thesis was written — the fallback reference point when it has never been checked. */
  thesisCreatedAt: Date;
};

/** Whole days between two dates (never negative — a clock skew of a few ms never counts as a day). */
function daysBetween(earlier: Date, later: Date): number {
  const ms = later.getTime() - earlier.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Evaluate a THESIS_REVIEW_DUE alert: due once `intervalDays` have passed
 * since the last check (or since the thesis was written, if never checked).
 */
export function evaluateThesisAlert(
  alert: ThesisAlertForEval,
  thesis: ThesisAlertInput,
  now: Date,
): AlertFireResult {
  const reference = thesis.lastCheckedAt ?? thesis.thesisCreatedAt;
  const daysSince = daysBetween(reference, now);

  if (daysSince >= alert.intervalDays) {
    return {
      fired: true,
      title: `Thesis review due — ${alert.ticker}`,
      body: thesis.lastCheckedAt
        ? `It's been ${daysSince} days since your last check (${formatShortDate(thesis.lastCheckedAt)}). Run "Check thesis now" to see if it still holds up.`
        : `It's been ${daysSince} days since you wrote this thesis and it has never been checked. Run "Check thesis now" to see if it still holds up.`,
    };
  }

  const daysRemaining = alert.intervalDays - daysSince;
  return {
    fired: false,
    outcome: `Checked — ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} until the next review is due.`,
  };
}

/**
 * Whether a TRIGGERED THESIS_REVIEW_DUE alert should auto re-arm: true once a
 * ThesisCheck newer than the alert's last trigger exists (the owner acted on
 * it), so it starts watching for the NEXT interval instead of staying stuck.
 * Price alerts never use this — they only re-arm by hand.
 */
export function shouldRearmThesisAlert(
  alert: { lastTriggeredAt: Date | null },
  lastCheckAt: Date | null,
): boolean {
  if (!alert.lastTriggeredAt || !lastCheckAt) return false;
  return lastCheckAt.getTime() > alert.lastTriggeredAt.getTime();
}

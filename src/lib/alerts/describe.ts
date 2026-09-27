// Plain-English one-line description of an alert's rule (e.g. "Falls below
// OMR 0.400", "Thesis review every 90 days") — used by the /watchlist Alerts
// card row. Pure, no I/O, same house style as src/lib/theses/checks.ts.
import type { AlertKind } from "@prisma/client";
import { formatMoney } from "@/lib/format";

export function describeAlertRule(alert: {
  kind: AlertKind;
  threshold: number | null;
  currency: string | null;
  intervalDays: number | null;
}): string {
  switch (alert.kind) {
    case "PRICE_ABOVE":
      return `Rises above ${formatMoney(alert.threshold ?? 0, alert.currency ?? "")}`;
    case "PRICE_BELOW":
      return `Falls below ${formatMoney(alert.threshold ?? 0, alert.currency ?? "")}`;
    case "DAY_DROP":
      return `Drops ${alert.threshold ?? 0}% or more in one day`;
    case "THESIS_REVIEW_DUE":
      return `Thesis review every ${alert.intervalDays ?? 0} days`;
  }
}

/** The alert shape both helpers below read. */
export type AlertRule = {
  kind: AlertKind;
  threshold: number | null;
  currency: string | null;
  intervalDays: number | null;
};

/**
 * The "…what you asked for" half of an explanation, e.g. "your alert was set
 * at 10% or more in one day". Returns null when the alert has no number on
 * record for its kind — an honest nothing rather than a guessed threshold.
 */
export function describeAlertThreshold(alert: AlertRule): string | null {
  switch (alert.kind) {
    case "PRICE_ABOVE":
      if (alert.threshold === null) return null;
      return `your alert was set at ${formatMoney(alert.threshold, alert.currency ?? "")} or above`;
    case "PRICE_BELOW":
      if (alert.threshold === null) return null;
      return `your alert was set at ${formatMoney(alert.threshold, alert.currency ?? "")} or below`;
    case "DAY_DROP":
      if (alert.threshold === null) return null;
      return `your alert was set at ${alert.threshold}% or more in one day`;
    case "THESIS_REVIEW_DUE":
      if (alert.intervalDays === null) return null;
      return `your alert asks for a review every ${alert.intervalDays} days`;
  }
}

function capitalizeFirst(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * One plain-English line explaining a fired alert: what actually happened
 * next to what the owner had asked for — e.g. "TICKER dropped 12.3% today —
 * your alert was set at 10% or more in one day."
 *
 * `happened` is the sentence recorded at the moment the alert fired (the
 * notification's own title, saved by src/lib/alerts/engine.ts); it is never
 * recalculated here, so no figure in this line is invented. Returns null when
 * there is nothing honest to say — no recorded outcome and no threshold.
 */
export function describeAlertTrigger(
  alert: AlertRule & { happened?: string | null },
): string | null {
  const threshold = describeAlertThreshold(alert);
  const happened = alert.happened?.trim() ? alert.happened.trim() : null;

  if (happened && threshold) {
    // The recorded sentence may already end in a full stop — don't double it.
    const cleaned = happened.replace(/[.\s]+$/, "");
    return `${cleaned} — ${threshold}.`;
  }
  if (happened) return happened.endsWith(".") ? happened : `${happened}.`;
  if (threshold) return `${capitalizeFirst(threshold)}.`;
  return null;
}

/**
 * The alert settings saved ON a notification at the moment the alert fired
 * (Notification.alertKind / alertThreshold / alertIntervalDays, with the
 * threshold in the notification's priceCurrency). Returns null for older
 * notifications recorded before these were saved — the caller then shows no
 * "your alert was set at" line at all, and never falls back to the alert's
 * CURRENT settings (the owner may have edited them since it fired).
 */
export function savedAlertRule(notification: {
  alertKind: AlertKind | null;
  alertThreshold: number | null;
  alertIntervalDays: number | null;
  priceCurrency: string | null;
}): AlertRule | null {
  if (notification.alertKind === null) return null;
  return {
    kind: notification.alertKind,
    threshold: notification.alertThreshold,
    currency: notification.priceCurrency,
    intervalDays: notification.alertIntervalDays,
  };
}

/**
 * Explanation line for a fired alert, built only from what was recorded when
 * it fired: the saved settings (see savedAlertRule) and the recorded
 * "what happened" sentence. With no saved settings, only the recorded
 * sentence is repeated; with neither, nothing is shown.
 */
export function describeFiredAlert(
  saved: AlertRule | null,
  happened?: string | null,
): string | null {
  if (saved) return describeAlertTrigger({ ...saved, happened });
  const cleaned = happened?.trim() ? happened.trim() : null;
  if (!cleaned) return null;
  return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
}

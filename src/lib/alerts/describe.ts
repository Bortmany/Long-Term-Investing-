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

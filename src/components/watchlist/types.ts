// Serializable data shapes the /watchlist server page hands to its client
// components (BUILD-PLAN.md Phase 7) — Prisma Decimals already converted to
// numbers at the edge, same convention as src/components/portfolio/types.ts
// and src/components/stocks/types.ts.
import type { AlertKind, AlertStatus, Currency, Market } from "@prisma/client";
import type { SourceBadgeProps } from "@/components/source-badge";
import type { AlertRule } from "@/lib/alerts/describe";
import type { ShariaBadgeData } from "@/lib/sharia/types";

/** One row of the watched/held instruments table. */
export type WatchlistInstrumentRow = {
  instrumentId: string;
  ticker: string;
  name: string;
  market: Market;
  quote:
    | { ok: true; value: number; currency: Currency; badge: Pick<SourceBadgeProps, "variant" | "date" | "detail"> }
    | { ok: false };
  held: boolean;
  watched: boolean;
  /** Count of this instrument's alerts currently in ACTIVE status. */
  activeAlertCount: number;
  /** Sharia screen badge data; absent when the person has the switch off (or is not on Pro). */
  sharia?: ShariaBadgeData | null;
};

/** One row of the Alerts card. */
export type AlertRowData = {
  id: string;
  kind: AlertKind;
  status: AlertStatus;
  instrumentId: string | null;
  instrumentTicker: string | null;
  instrumentCurrency: Currency | null;
  thesisId: string | null;
  thesisTicker: string | null;
  threshold: number | null;
  intervalDays: number | null;
  lastEvaluatedAt: Date | null;
  lastOutcome: string | null;
  /**
   * The settings this alert had when it last fired (saved on its newest
   * notification), or null if none were recorded. A triggered row's
   * "your alert was set at" line comes only from this.
   */
  firedRule: AlertRule | null;
};

/** Instrument option for the alert dialog's price-kind picker (held or watched). */
export type AlertInstrumentOption = { id: string; ticker: string; name: string; currency: Currency };

/** Thesis option for the alert dialog's THESIS_REVIEW_DUE picker (the user's ACTIVE theses). */
export type AlertThesisOption = { id: string; ticker: string };

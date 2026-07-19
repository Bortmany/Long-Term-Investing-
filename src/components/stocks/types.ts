// Serializable data shapes the /stocks and /stocks/[id] server pages hand to
// their client leaf components. Everything here is plain data (numbers,
// strings, Dates) — Prisma Decimals and DataResult unions were already
// resolved at the edge by the server page.
import type { Currency, Market } from "@prisma/client";
import type { RatioResult } from "@/lib/stocks/ratios";
import type { StatementTable } from "@/lib/stocks/statement-table";
import type { SourceBadgeProps } from "@/components/source-badge";
import type { GlossaryKey } from "@/lib/glossary";

/** One row of the /stocks table. */
export type StockListRow = {
  instrumentId: string;
  ticker: string;
  name: string;
  market: Market;
  quote:
    | {
        ok: true;
        value: number;
        currency: Currency;
        badge: Pick<SourceBadgeProps, "variant" | "date">;
      }
    | { ok: false };
  change:
    | {
        ok: true;
        percent: number;
        badge: Pick<SourceBadgeProps, "variant" | "date">;
      }
    | { ok: false };
  held: boolean;
  watched: boolean;
};

/** One tile in the ratio strip (ui-spec §4.2) — each ratio fails independently. */
export type RatioTile = {
  label: string;
  result: RatioResult;
  /** How to render the number when it's available. */
  kind: "multiple" | "percent";
  /** Glossary key for the label's explainer tip. */
  term: GlossaryKey;
};

export type StatementBlock =
  | {
      ok: true;
      badge: Pick<SourceBadgeProps, "variant" | "date">;
      table: StatementTable;
    }
  | { ok: false; message: string };

/** One row of the dividend-history table. */
export type DividendHistoryRow = {
  exDate: Date;
  amountPerShare: number;
  currency: Currency;
  badge: Pick<SourceBadgeProps, "variant" | "date">;
};

/** One row of the upcoming-dividends list. */
export type UpcomingDividendRow = {
  exDate: Date;
  amountPerShare: number | null;
  currency: Currency;
  badge: Pick<SourceBadgeProps, "variant" | "date">;
};

// Plain, serializable shapes handed from the server pages to the client
// components under src/components/stocks/. No Prisma Decimals or Dates that
// aren't RSC-serializable leak across the boundary.

import type { Currency } from "@prisma/client";
import type { SourceBadgeProps } from "@/components/source-badge";

/** Badge props (variant + optional pre-formatted date) for a figure's source. */
export type BadgeProps = Pick<SourceBadgeProps, "variant" | "date">;

/** One row of the /stocks table (ui-spec §4.1). */
export type StockRowData = {
  id: string;
  ticker: string;
  name: string;
  /** Latest quote, or the honest "no price" branch — never a fake zero. */
  quote:
    | { ok: true; price: number; currency: Currency; badge: BadgeProps }
    | { ok: false };
  /** Day change %, or null when it can't be derived from two closes. */
  changePct: number | null;
  /** The instrument appears in the user's portfolio transactions. */
  held: boolean;
  /** The instrument is on the user's watchlist. */
  watched: boolean;
};

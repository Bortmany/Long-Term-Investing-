// ResponsiveRows: shows the existing wide table from a screen width up, and a
// stack of row cards below it. CSS only (no script), so there is no flash and
// no mismatch between server and browser. Both versions are in the page; the
// hidden one is display:none, so screen readers and keyboard users meet only
// one of them. The cards sit in a plain list so a screen reader announces
// "list, N items".
//
// Switch points: "md" = 768px, "lg" = 1024px, "xl" = 1280px. Holdings and
// Transactions use "xl" (a 9- or 10-column table needs about 1000px of room);
// narrower tables use "md".
import * as React from "react";

import { cn } from "@/lib/utils";

type Breakpoint = "md" | "lg" | "xl";

const CARDS_HIDDEN_FROM: Record<Breakpoint, string> = {
  md: "md:hidden",
  lg: "lg:hidden",
  xl: "xl:hidden",
};
const TABLE_SHOWN_FROM: Record<Breakpoint, string> = {
  md: "hidden md:block",
  lg: "hidden lg:block",
  xl: "hidden xl:block",
};

export function ResponsiveRows({
  table,
  cards,
  breakpoint = "md",
  listLabel,
  className,
}: {
  /** The existing table, untouched. */
  table: React.ReactNode;
  /** One <RowCard> per row (each is rendered inside its own list item). */
  cards: React.ReactNode[];
  /** Cards below this width, the table from it up. */
  breakpoint?: Breakpoint;
  /** Accessible name of the card list, e.g. "Holdings". */
  listLabel: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className={TABLE_SHOWN_FROM[breakpoint]}>{table}</div>
      <ul
        aria-label={listLabel}
        className={cn("flex flex-col gap-2", CARDS_HIDDEN_FROM[breakpoint])}
      >
        {cards.map((card, index) => (
          <li key={index}>{card}</li>
        ))}
      </ul>
    </div>
  );
}

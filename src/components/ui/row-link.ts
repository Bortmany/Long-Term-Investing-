// Class names for the "whole row is a link" pattern on TABLE rows (the card
// version lives in row-card.tsx as ROW_CARD_LINK).
//
// The ticker is the one real link (a Tab stop, right-click "open in new tab"
// works, screen readers announce it). Its invisible layer (the ::after box)
// is stretched over the whole row because the row is positioned, so a click
// anywhere on the row opens the stock. Buttons inside the row (watch star,
// actions menu) sit above that layer with TABLE_ROW_RAISED, so pressing them
// never also opens the stock.

/** On the <TableRow>: positioned so the link layer fills it, with link-row hover. */
export const TABLE_ROW_LINKED =
  "relative cursor-pointer hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-800/50 dark:active:bg-slate-800";

/** On the ticker <Link> inside a linked table row. */
export const TABLE_ROW_LINK =
  "-my-2.5 inline-flex min-h-11 items-center font-mono font-medium text-blue-600 after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring dark:text-blue-400";

/** On a wrapper around any button or menu in a linked row: sits above the link layer. */
export const TABLE_ROW_RAISED = "relative z-10";

/** On the ticker <Link> of a card: makes the link box itself 44px tall without moving the layout. */
export const CARD_LINK_TAP_AREA = "-my-2.5 inline-flex min-h-11 items-center";

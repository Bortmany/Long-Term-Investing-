// RowCard: one table row as a card, made of named slots so every screen fills
// the same slots in the same order (phone-tables-as-cards spec, section 2.1).
//
//   Identity   ticker or main name (+ optional inline pill)
//   Name       company name, one line with an ellipsis (the ONLY text that may be cut)
//   Badges     optional badge row under the name
//   Headline   the main figure(s); the secondary figure wraps under the main
//              one if they do not fit side by side. Nothing is ever cut off.
//   Details    optional labelled pairs in two columns
//   Meta       optional short facts joined by " · "
//   Rail       44px strip: the one action button on top, a chevron below only
//              when the card goes somewhere
//
// "standard" density: Identity, Name, Badges, Headline, Details/Meta.
// "compact" density: the headline sits at the end of the identity line (used
// by Transactions, where there is no name line).
//
// A card that goes somewhere uses a real link in the identity slot given the
// ROW_CARD_LINK class: its invisible layer covers the whole card, and the rail
// button sits above it, so tapping the button never also opens the page.
import * as React from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/** Put this on the identity <Link> so it stretches over the whole card. */
export const ROW_CARD_LINK =
  "font-mono text-base font-semibold text-blue-600 after:absolute after:inset-0 after:rounded-lg after:content-[''] hover:underline focus-visible:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring dark:text-blue-400";

export type RowCardDetail = { label: string; value: React.ReactNode; title?: string };

export function RowCard({
  identity,
  name,
  badges,
  headline,
  details,
  meta,
  action,
  chevron = false,
  density = "standard",
  className,
}: {
  identity: React.ReactNode;
  name?: React.ReactNode;
  badges?: React.ReactNode;
  headline?: React.ReactNode;
  details?: RowCardDetail[];
  meta?: React.ReactNode;
  /** The one action button (three-dot menu or star), at least 44 x 44. */
  action?: React.ReactNode;
  /** True only when the card goes somewhere (it has a ROW_CARD_LINK). */
  chevron?: boolean;
  density?: "standard" | "compact";
  className?: string;
}) {
  const compact = density === "compact";
  return (
    <div
      className={cn(
        "relative flex min-h-[72px] gap-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950",
        chevron && "active:bg-slate-100 dark:active:bg-slate-800 md:hover:bg-slate-50 dark:md:hover:bg-slate-800/50",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {compact ? (
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="flex min-w-0 items-center gap-2 text-base font-medium">{identity}</div>
            {headline ? <div className="text-right">{headline}</div> : null}
          </div>
        ) : (
          <div className="flex min-w-0 flex-wrap items-center gap-2">{identity}</div>
        )}
        {name ? (
          <p className="truncate text-sm text-slate-600 dark:text-slate-400">{name}</p>
        ) : null}
        {badges ? <div className="mt-1 flex flex-wrap gap-1">{badges}</div> : null}
        {!compact && headline ? (
          <div className="mt-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            {headline}
          </div>
        ) : null}
        {details && details.length > 0 ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            {details.map((detail) => (
              <div key={detail.label} className="min-w-0">
                <dt className="text-xs text-slate-500 dark:text-slate-400">{detail.label}</dt>
                <dd className="text-sm" title={detail.title}>
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {meta ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{meta}</p>
        ) : null}
      </div>
      {action || chevron ? (
        <div className="flex w-11 shrink-0 flex-col items-center justify-between">
          <div className="relative z-10 -me-2 -mt-2">{action}</div>
          {chevron ? (
            <ChevronRight aria-hidden="true" className="size-4 text-slate-400" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

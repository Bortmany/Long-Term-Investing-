"use client";

// The key to the little badges that sit next to every number in the app.
// Same idea and same shape as ExplainerTip (a plain-English dialog opened by
// a small question-mark trigger) — a dialog rather than a hover tooltip for
// the same reason given there: the shared Tooltip is hover-only and one line
// wide, which can't hold four explanations or work on a touch screen.
//
// The badges themselves are rendered by the real SourceBadge component, so
// the legend can never drift from the colours and wording on the pages.
// No made-up figures here: the "Manual" badge is shown without an example
// date, because every real one carries the date its price was entered.
import * as React from "react";
import { CircleQuestionMark } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SourceBadge, type SourceBadgeVariant } from "@/components/source-badge";
import { cn } from "@/lib/utils";

const LEGEND: { variant: SourceBadgeVariant; meaning: string }[] = [
  {
    variant: "live",
    meaning:
      "Fetched from the market-data provider. Prices are refreshed at most every 15 minutes, so this is the latest price we were given.",
  },
  {
    variant: "manual",
    meaning:
      "A price entered by hand, always shown with the date it was entered so you can see how old it is. Used for markets the provider doesn't cover.",
  },
  {
    variant: "sample",
    meaning:
      "Demo data that ships with the app so screens aren't empty. It is not a real market price — and alerts never fire on it.",
  },
  {
    variant: "derived",
    meaning:
      "Worked out from your own recorded buys, sells and dividends. No outside data source is involved.",
  },
];

export function SourceBadgeLegend({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded text-xs text-slate-500 outline-none transition-colors hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-ring dark:text-slate-400 dark:hover:text-slate-200",
          className,
        )}
      >
        <CircleQuestionMark className="size-3.5" aria-hidden="true" />
        What do these badges mean?
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>What do these badges mean?</DialogTitle>
            <DialogDescription>
              Every number in the app carries a badge saying where it came from. If a figure
              can&apos;t be sourced, the app says so instead of showing a number.
            </DialogDescription>
          </DialogHeader>
          <ul className="mt-2 space-y-3">
            {LEGEND.map((entry) => (
              <li key={entry.variant} className="flex flex-col gap-1">
                <SourceBadge variant={entry.variant} className="self-start" />
                <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {entry.meaning}
                </p>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

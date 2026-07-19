"use client";

// Learn-as-you-go explainer (BUILD-PLAN.md Phase 7B). Sits on a metric's
// LABEL (never next to the number — that slot belongs to SourceBadge) and
// opens the plain-English glossary entry for that term.
//
// DELIBERATE CHOICE: Dialog-on-click, not a hover Tooltip. The hand-rolled
// Tooltip (src/components/ui/tooltip.tsx) is hover-only, `whitespace-nowrap`,
// and sized for a short one-line label — it can't hold the glossary's
// multi-sentence detail text, and hover-only doesn't work on touch devices
// at any of the three breakpoints. Dialog-on-click works identically on
// desktop, tablet, and mobile, and has room for the full explanation.
import * as React from "react";
import { CircleQuestionMark } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";
import { cn } from "@/lib/utils";

export function ExplainerTip({
  term,
  className,
}: {
  term: GlossaryKey;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const entry = GLOSSARY[term];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`What is ${entry.term}?`}
        className={cn(
          "inline-flex size-[14px] shrink-0 items-center justify-center text-slate-400 outline-none transition-colors hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-ring dark:text-slate-500 dark:hover:text-slate-300",
          className,
        )}
      >
        <CircleQuestionMark className="size-full" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{entry.term}</DialogTitle>
            <DialogDescription>{entry.short}</DialogDescription>
          </DialogHeader>
          <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {entry.detail}
          </p>
          {entry.example ? (
            <p className="mt-3 text-xs italic text-slate-500 dark:text-slate-400">
              Example: {entry.example}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

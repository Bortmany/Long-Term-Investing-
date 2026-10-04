"use client";

// ShariaBadge: a small slate-grey label saying what the BOUGHT screen says
// (Compliant / Not compliant / Not screened), with the method, supplier and
// date one tap away. It never wears a SourceBadge (a verdict is not one of
// the four number sources); it carries its own source + method + date line.
// State is never shown by colour alone: each look has its own icon, border
// style and words. It renders only when its data is already on the page.

import * as React from "react";
import { Info, ShieldCheck, ShieldQuestion, ShieldX } from "lucide-react";

import { Popover } from "@/components/ui/popover";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ShariaBadgeData, ShariaState } from "@/lib/sharia/types";
import {
  BADGE_ACCESSIBLE_NAMES,
  BADGE_HOVER_HINT,
  BADGE_LABELS,
  NEVER_GUESS,
  PANEL_CAPTION,
  PANEL_GOT_IT,
  fetchedSentence,
  methodSentence,
  notScreenedReasonText,
} from "@/lib/sharia/wording";

const LOOKS: Record<ShariaState, string> = {
  compliant:
    "border border-slate-400 bg-slate-100 text-slate-800 hover:bg-slate-200 aria-expanded:bg-slate-200 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:aria-expanded:bg-slate-700",
  not_compliant:
    "border border-slate-700 bg-white text-slate-900 hover:bg-slate-100 aria-expanded:bg-slate-100 dark:border-slate-300 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800 dark:aria-expanded:bg-slate-800",
  not_screened:
    "border border-dashed border-slate-300 bg-transparent text-slate-600 hover:bg-slate-100 aria-expanded:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:aria-expanded:bg-slate-800",
};

// The same looks without hover states, for the non-interactive copy in the panel.
const STATIC_LOOKS: Record<ShariaState, string> = {
  compliant:
    "border border-slate-400 bg-slate-100 text-slate-800 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100",
  not_compliant:
    "border border-slate-700 bg-white text-slate-900 dark:border-slate-300 dark:bg-slate-900 dark:text-slate-50",
  not_screened:
    "border border-dashed border-slate-300 bg-transparent text-slate-600 dark:border-slate-700 dark:text-slate-400",
};

function StateIcon({ state }: { state: ShariaState }) {
  const className = "size-3 shrink-0";
  if (state === "compliant") return <ShieldCheck className={className} aria-hidden="true" />;
  if (state === "not_compliant") return <ShieldX className={className} aria-hidden="true" />;
  return <ShieldQuestion className={className} aria-hidden="true" />;
}

/** The pill by itself (the panel shows a non-interactive copy of it). */
function Pill({ state }: { state: ShariaState }) {
  return (
    <>
      <StateIcon state={state} />
      {BADGE_LABELS[state]}
    </>
  );
}

export function ShariaBadge({ data, className }: { data: ShariaBadgeData; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();

  return (
    <>
      <Tooltip className={cn("align-middle", className)}>
        <button
          ref={anchorRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={BADGE_ACCESSIBLE_NAMES[data.state]}
          onClick={() => setOpen((value) => !value)}
          data-sharia-state={data.state}
          // The invisible ::before widens the tap area to at least 44px
          // without making the 24px pill (or a table row) any taller.
          className={cn(
            "relative z-10 inline-flex h-6 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium outline-none transition-colors",
            "before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']",
            "focus-visible:ring-2 focus-visible:ring-ring active:brightness-95",
            LOOKS[data.state],
          )}
        >
          <Pill state={data.state} />
          <Info className="size-3 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
        </button>
        <TooltipContent side="bottom">{BADGE_HOVER_HINT}</TooltipContent>
      </Tooltip>
      <Popover
        open={open}
        onOpenChange={setOpen}
        anchorRef={anchorRef}
        labelledBy={titleId}
        closeLabel={PANEL_GOT_IT}
      >
        <ShariaDetail data={data} titleId={titleId} />
      </Popover>
    </>
  );
}

/** The panel's content. Exported for tests. */
export function ShariaDetail({ data, titleId }: { data: ShariaBadgeData; titleId: string }) {
  const hasVerdict = data.state !== "not_screened";
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">{PANEL_CAPTION}</p>
      <p id={titleId} className="text-base font-semibold">
        {data.stockName} ({data.ticker})
      </p>
      <span
        className={cn(
          "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
          STATIC_LOOKS[data.state],
        )}
      >
        <Pill state={data.state} />
      </span>
      {hasVerdict ? (
        <>
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {methodSentence({
              methodName: data.methodName ?? "",
              methodVersion: data.methodVersion ?? "",
              vendorName: data.vendorName,
              checkedLabel: data.checkedLabel ?? "",
            })}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {fetchedSentence(data.vendorName, data.fetchedLabel ?? "")}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {notScreenedReasonText(data.reason ?? "no_verdict", {
              exchangeName: data.exchangeName,
              checkedLabel: data.checkedLabel,
            })}
          </p>
          <p className="text-sm font-medium">{NEVER_GUESS}</p>
        </>
      )}
    </div>
  );
}

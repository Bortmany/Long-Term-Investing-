"use client";

// The quiet "From broker" tag on synced trades (UI spec section 12). Not
// green/blue/amber: it is information, not good or bad news. Laptop: the
// explanation appears on hover or keyboard focus. Phone card: tapping the tag
// opens the same sentence as a line underneath.
import * as React from "react";
import { Landmark } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fromBrokerExplanation } from "@/lib/broker/tag-text";

const TAG_CLASS = "gap-1.5 text-xs font-normal text-slate-600 dark:text-slate-400";

function TagPill() {
  return (
    <Badge variant="outline" className={TAG_CLASS}>
      <Landmark className="size-3" aria-hidden="true" />
      From broker
    </Badge>
  );
}

/** Table cell version: explanation on hover or focus. */
export function FromBrokerTag({
  syncedOn,
  connected,
}: {
  syncedOn: Date | null;
  connected: boolean;
}) {
  const text = fromBrokerExplanation(syncedOn, connected);
  return (
    <Tooltip>
      <TooltipTrigger aria-label={`From broker. ${text}`}>
        <TagPill />
      </TooltipTrigger>
      <TooltipContent side="left" className="w-64 whitespace-normal">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/** Phone card version: a 44px-tall tap target that opens the explanation inline. */
export function FromBrokerTagToggle({
  syncedOn,
  connected,
}: {
  syncedOn: Date | null;
  connected: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="w-full">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <TagPill />
      </button>
      {open ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {fromBrokerExplanation(syncedOn, connected)}
        </p>
      ) : null}
    </div>
  );
}

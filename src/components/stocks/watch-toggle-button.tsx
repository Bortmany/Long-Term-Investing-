"use client";

// Watch/unwatch star toggle, used on the /stocks table and the /stocks/[id]
// header (ui-spec §4.1 / §4.2). Star icon-only button — filled blue when
// watched, the one legitimate extra use of the accent color for a "selected
// state" per the Phase 1 tokens doc.
import * as React from "react";
import { LoaderCircle, Star, StarOff } from "lucide-react";

import { addToWatchlist, removeFromWatchlist } from "@/app/actions/stocks";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function WatchToggleButton({
  instrumentId,
  initialWatched,
  ticker,
  size = "icon",
}: {
  instrumentId: string;
  initialWatched: boolean;
  ticker: string;
  /** "icon" for a bare star (table rows); "sm" adds a label (profile header). */
  size?: "icon" | "sm";
}) {
  const [watched, setWatched] = React.useState(initialWatched);
  const [isPending, startTransition] = React.useTransition();

  function handleClick() {
    if (isPending) return;
    const next = !watched;
    startTransition(async () => {
      const result = next
        ? await addToWatchlist(instrumentId)
        : await removeFromWatchlist(instrumentId);
      // Optimistic only on success — a failure (rare: session lapsed, rate
      // limited) leaves the star showing the true, unchanged state.
      if (result.ok) setWatched(next);
    });
  }

  const label = watched ? `Stop watching ${ticker}` : `Watch ${ticker}`;

  if (size === "sm") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={handleClick}
      >
        {isPending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : watched ? (
          <Star
            className="size-4 fill-blue-600 text-blue-600 dark:fill-blue-500 dark:text-blue-500"
            aria-hidden="true"
          />
        ) : (
          <StarOff className="size-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
        )}
        {watched ? "Watching" : "Watch"}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9"
          disabled={isPending}
          onClick={handleClick}
          aria-label={label}
          aria-pressed={watched}
        >
          {isPending ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : watched ? (
            <Star
              className="size-4 fill-blue-600 text-blue-600 dark:fill-blue-500 dark:text-blue-500"
              aria-hidden="true"
            />
          ) : (
            <StarOff className="size-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

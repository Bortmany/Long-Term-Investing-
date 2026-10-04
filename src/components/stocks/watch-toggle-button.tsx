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
import { useToast } from "@/components/ui/toast";
import {
  backOnWatchlistMessage,
  removedToastMessage,
  undoFailureMessage,
  watchFailureMessage,
} from "@/lib/stocks/watch-messages";

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
  const { toast } = useToast();

  function handleClick() {
    if (isPending) return;
    const next = !watched;
    startTransition(async () => {
      const result = next
        ? await addToWatchlist(instrumentId)
        : await removeFromWatchlist(instrumentId);
      // Optimistic only on success — a failure (rare: session lapsed, rate
      // limited) leaves the star showing the true, unchanged state, and now
      // says so instead of failing silently.
      if (!result.ok) {
        toast({
          tone: "error",
          message: watchFailureMessage(result.error),
        });
        return;
      }
      setWatched(next);
      if (!next) {
        // Un-watching offers an Undo. It calls the SAME addToWatchlist server
        // action as the star, so the 30-a-minute watchlist-write limit applies
        // to it too — there is no other route back. If the limiter refuses,
        // the toast says so in the standard "Too many requests" sentence.
        toast({
          message: removedToastMessage(ticker),
          action: {
            label: "Undo",
            ariaLabel: `Undo removing ${ticker}`,
            run: async () => {
              const back = await addToWatchlist(instrumentId);
              if (back.ok) {
                setWatched(true);
                return { message: backOnWatchlistMessage(ticker) };
              }
              return {
                tone: "error",
                message: undoFailureMessage(ticker, back.error),
              };
            },
          },
        });
      }
    });
  }

  const label = watched ? `Stop watching ${ticker}` : `Watch ${ticker}`;

  if (size === "sm") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11"
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
          className="size-11"
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

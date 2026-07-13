"use client";

// The watch/unwatch star toggle, reused by the Stocks table (§4.1) and the
// stock detail header (§4.2). A filled blue star means "watched" — the one
// legitimate use of the accent color for a selected state (Phase 1 tokens);
// an outline slate StarOff means "not watched". Toggling is optimistic and
// reverts if the server action reports failure.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Star, StarOff } from "lucide-react";

import { toggleWatch } from "@/app/actions/watchlist";
import { cn } from "@/lib/utils";

export function WatchStar({
  instrumentId,
  watched,
  className,
}: {
  instrumentId: string;
  watched: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  // Optimistic state resets to the server-sent `watched` prop automatically
  // when the transition ends — so a failed toggle reverts, and a successful
  // one is confirmed by router.refresh() bringing the fresh prop.
  const [optimistic, setOptimistic] = React.useOptimistic(watched);

  function onToggle(event: React.MouseEvent) {
    // Never let the click bubble to a clickable table row behind it.
    event.stopPropagation();
    startTransition(async () => {
      setOptimistic(!watched);
      const result = await toggleWatch(instrumentId);
      if (result.ok) {
        router.refresh();
      }
      // On failure, the transition ends and `optimistic` reverts to `watched`
      // — no fake state is left behind.
    });
  }

  const label = optimistic ? "Remove from watchlist" : "Add to watchlist";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isPending}
      aria-label={label}
      aria-pressed={optimistic}
      title={label}
      className={cn(
        "flex size-9 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
    >
      {optimistic ? (
        <Star className="size-4 fill-blue-600 text-blue-600 dark:fill-blue-500 dark:text-blue-500" />
      ) : (
        <StarOff className="size-4 text-slate-400 dark:text-slate-500" />
      )}
    </button>
  );
}

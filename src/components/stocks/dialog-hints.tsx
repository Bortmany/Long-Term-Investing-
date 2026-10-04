"use client";

// Small helpers shared by the Track a Stock and Add Transaction dialogs
// (gulf-markets-live-ui spec section 5): the plain-English hover/focus hints
// and the one-second highlight ring shown when picking a market moves the
// currency for the user.
import * as React from "react";

import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const MARKET_HINT = "The stock exchange this share is traded on.";
export const CURRENCY_HINT = "The currency this stock's price is quoted in.";
export const PREFILL_HINT =
  "Looks up the company name and details from FMP. Works best for US stocks; for Gulf stocks you may need to type the name yourself.";

/** How long the ring stays on the currency box after it changes by itself. */
export const AUTO_CHANGE_RING_MS = 1000;

/** Classes that give the currency dropdown a focus-style ring (existing ring colour). */
export const AUTO_CHANGE_RING_CLASS =
  "[&_select]:border-ring [&_select]:ring-2 [&_select]:ring-ring/40";

/**
 * True for about a second after `pulse()` is called. Used to highlight the
 * currency box when the market change moved it.
 */
export function useAutoChangeRing(): { active: boolean; pulse: () => void } {
  const [active, setActive] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const pulse = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setActive(true);
    timer.current = setTimeout(() => {
      setActive(false);
      timer.current = null;
    }, AUTO_CHANGE_RING_MS);
  }, []);

  return { active, pulse };
}

/**
 * Wraps a control so a short hint opens on hover and on keyboard focus of the
 * control inside (the tooltip shows on group focus-within, so no extra tab
 * stop is added).
 */
export function HintedControl({
  hint,
  children,
  className,
}: {
  hint: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip className={cn("flex w-full", className)}>
      {children}
      <TooltipContent
        side="bottom"
        className="left-0 w-64 max-w-[80vw] translate-x-0 whitespace-normal text-left"
      >
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

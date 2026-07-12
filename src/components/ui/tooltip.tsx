// Hand-written Tooltip. @radix-ui/react-tooltip is not installed, so this is
// a CSS-driven tooltip: the content appears on hover and on keyboard focus
// (the trigger is focusable, so tapping/tabbing also reveals it). It keeps
// the shadcn component API shape (Tooltip / TooltipTrigger / TooltipContent)
// so call sites read the same as standard shadcn code.
import * as React from "react";

import { cn } from "@/lib/utils";

function TooltipProvider({ children }: { children: React.ReactNode }) {
  // No-op provider kept for API compatibility with shadcn call sites.
  return <>{children}</>;
}

function Tooltip({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="tooltip"
      className={cn("group/tooltip relative inline-flex", className)}
      {...props}
    />
  );
}

function TooltipTrigger({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="tooltip-trigger"
      tabIndex={0}
      className={cn("inline-flex outline-none", className)}
      {...props}
    />
  );
}

function TooltipContent({
  className,
  side = "top",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { side?: "top" | "right" }) {
  return (
    <span
      role="tooltip"
      data-slot="tooltip-content"
      className={cn(
        "pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1 text-xs text-slate-50 opacity-0 shadow-sm transition-opacity duration-100 group-focus-within/tooltip:opacity-100 group-hover/tooltip:opacity-100 dark:bg-slate-50 dark:text-slate-900",
        side === "top" && "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
        side === "right" && "left-full top-1/2 ml-2 -translate-y-1/2",
        className,
      )}
      {...props}
    />
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };

"use client";

// The action row at the bottom of a wizard screen. On a phone it sticks to the
// bottom of the screen (thumb zone, with room for the home bar) and stacks the
// buttons full width with the main one first (each screen gives its buttons
// order-1 / order-2 so the main button leads on a phone). On a laptop it is a normal row.

import * as React from "react";

import { cn } from "@/lib/utils";

export function StickyActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-6 -mb-6 mt-6 flex flex-col gap-2 rounded-b-lg border-t border-border bg-background px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
        "[&>button]:w-full",
        "lg:static lg:mx-0 lg:mb-0 lg:flex-row lg:justify-between lg:border-0 lg:bg-transparent lg:p-0 lg:[&>button]:w-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}

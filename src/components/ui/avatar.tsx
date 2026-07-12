// Hand-written shadcn-style Avatar. @radix-ui/react-avatar is not installed;
// Phase 1 only needs the initials fallback (no photo upload), so this is a
// simple styled circle with the same component API.
import * as React from "react";

import { cn } from "@/lib/utils";

function Avatar({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className,
      )}
      {...props}
    />
  );
}

function AvatarFallback({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-xs font-medium uppercase",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarFallback };

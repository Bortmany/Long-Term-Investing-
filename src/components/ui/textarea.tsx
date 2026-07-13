// Hand-written shadcn-style Textarea (CLI unavailable) — Input's classes on
// a <textarea>, defaulting to 4 rows, vertically resizable.
import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({
  className,
  rows = 4,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full min-w-0 resize-y rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

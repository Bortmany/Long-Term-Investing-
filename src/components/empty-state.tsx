// Shared empty-state template (UI spec §5) — used by the seven placeholder
// pages and by the Holdings card when a portfolio has no positions.
import type * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  heading,
  sentence,
  comingSoon = false,
  action,
  className,
}: {
  icon: LucideIcon;
  heading: string;
  sentence: string;
  comingSoon?: boolean;
  /**
   * Optional call-to-action (e.g. an "Add Transaction" button), rendered
   * last. A screen uses either `comingSoon` or `action`, never both.
   */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex h-full min-h-[60vh] w-full max-w-sm flex-col items-center justify-center text-center",
        className,
      )}
    >
      <div className="flex size-[72px] items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <Icon className="size-12 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-xl font-semibold">{heading}</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{sentence}</p>
      {comingSoon ? (
        <Badge variant="secondary" className="mt-4">
          Coming soon
        </Badge>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

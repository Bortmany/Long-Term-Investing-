// Amber dividend warnings that REPLACE the clean "Computed from your
// transactions" badge when a dividend figure had to leave something out.
// Amber = warning only; the figure itself keeps its normal colour.
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DividendCardState } from "@/lib/portfolio";

type Warning = Extract<DividendCardState, { kind: "warning" }>;

/** Compact line under the figure on the summary card (hover, focus or tap for the hint). */
export function DividendWarningLine({ warning }: { warning: Warning }) {
  return (
    <Tooltip className="max-w-full">
      <TooltipTrigger className="items-start gap-1.5 text-left text-xs text-amber-700 dark:text-amber-400">
        <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden="true" />
        <span>{warning.title}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="left-0 w-64 translate-x-0 whitespace-normal">
        {warning.hint}
      </TooltipContent>
    </Tooltip>
  );
}

/** Full alert at the top of the Dividend Income card. */
export function DividendWarningAlert({ warning }: { warning: Warning }) {
  return (
    <Alert variant="warning" className="mb-4">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle className="line-clamp-none">{warning.title}</AlertTitle>
      <AlertDescription>
        <p>{warning.description}</p>
        <Link
          href="/settings#exchange-rates"
          className="inline-flex min-h-11 items-center text-sm font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
        >
          Add an exchange rate
        </Link>
      </AlertDescription>
    </Alert>
  );
}

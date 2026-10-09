// The "Couldn't be valued" row under a breakdown's legend. It is NOT a donut
// slice: something that could not be valued has no honest size, so it gets a
// hollow dashed marker and a count instead of a percentage. Amber because it
// needs the owner's action (unlike the grey "Unknown" bucket, which is a real
// value with no sector recorded).
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { holdingsCount } from "@/lib/portfolio/unvalued";
import type { UnvaluedHolding } from "@/lib/portfolio";

export function UnvaluedLegendRow({ unvalued }: { unvalued: UnvaluedHolding[] }) {
  if (unvalued.length === 0) return null;
  const names = unvalued.map((u) => u.label).join(", ");
  const reasons = new Set(
    unvalued.map((u) => (u.reason === "missing_price" ? "price" : "exchange rate")),
  );
  const reasonText = [...reasons].join(" or ");
  return (
    <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
      <Tooltip className="flex w-full">
        <TooltipTrigger className="min-h-11 w-full items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full border border-dashed border-amber-600 dark:border-amber-400"
          />
          <span className="flex-1 text-left">Couldn&apos;t be valued</span>
          <span className="tabular-nums">{holdingsCount(unvalued.length)}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="left-0 w-64 translate-x-0 whitespace-normal">
          {names}: no {reasonText}, so they aren&apos;t in the chart or the percentages above.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

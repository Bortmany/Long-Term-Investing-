// UsageBar (go-public-ui.md §3) — one thin meter: a label, "used of limit",
// an 8px bar and a reset line. The figures come straight from the function
// that enforces the AI limits (readAiUsage in src/lib/ai/spend-cap.ts); this
// component only draws them. When the limit is reached the bar turns amber
// AND the text says so — colour is never the only signal.
import { cn } from "@/lib/utils";

export function UsageBar({
  label,
  used,
  limit,
  resetLine,
}: {
  label: string;
  used: number;
  limit: number;
  resetLine: string;
}) {
  const full = used >= limit;
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const valueText = `${used} of ${limit}`;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="text-slate-700 dark:text-slate-300">{label}</span>
        <span className="font-medium tabular-nums text-slate-900 dark:text-slate-50">
          {valueText}
          {full ? <span className="sr-only"> (limit reached)</span> : null}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={full ? `${valueText}, limit reached` : valueText}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <div
          className={cn(
            "h-full rounded-full",
            full ? "bg-amber-500" : "bg-blue-600 dark:bg-blue-500",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {full ? "Limit reached. " : ""}
        {resetLine}
      </p>
    </div>
  );
}

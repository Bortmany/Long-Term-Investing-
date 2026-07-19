// Flat check-history timeline below the Latest Check panel (ui-spec §5.2) —
// newest first, not expandable/collapsible; a personal tool's expected scale
// is a handful of checks per thesis.
import type { ThesisCheck } from "@prisma/client";

import { formatShortDate } from "@/lib/format";
import { RecommendationChip } from "./recommendation-chip";

type ThesisCheckEvidence = {
  supporting?: string[];
  weakening?: string[];
  improving?: string[];
};

/** One truncated line of evidence to summarize a history entry. */
function evidenceSummary(evidence: unknown): string | null {
  const parsed = evidence as ThesisCheckEvidence | null;
  return (
    parsed?.supporting?.[0] ??
    parsed?.weakening?.[0] ??
    parsed?.improving?.[0] ??
    null
  );
}

export function CheckHistoryTimeline({ checks }: { checks: ThesisCheck[] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">Check History</h2>
      {checks.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No checks yet — click &quot;Check thesis now&quot; above to run the first one.
        </p>
      ) : (
        <ol className="border-l-2 border-slate-200 dark:border-slate-800">
          {checks.map((check) => {
            const summary = evidenceSummary(check.evidence);
            return (
              <li key={check.id} className="relative pb-6 pl-4">
                <span
                  aria-hidden="true"
                  className="absolute -left-[5px] top-1.5 size-2 rounded-full bg-slate-400 dark:bg-slate-600"
                />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-500 dark:text-slate-400">
                    {formatShortDate(check.createdAt)}
                  </span>
                  <span className="font-medium tabular-nums">{check.integrityScore}</span>
                  <RecommendationChip recommendation={check.recommendation} className="text-xs" />
                </div>
                {summary ? (
                  <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-400">
                    {summary}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

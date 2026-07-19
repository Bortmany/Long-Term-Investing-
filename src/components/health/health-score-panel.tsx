// The Portfolio Health Score AiPanel instance — used on both the Dashboard
// card and the /portfolio section (BUILD-PLAN.md Phase 3). THE AI RULE: the
// page that renders this only ever passes in whatever is already stored;
// generation happens exclusively via the button inside AiPanel, never on
// render (see generateHealthScore in src/app/actions/health-score.ts).
import type { AiAnalysis } from "@prisma/client";

import { AiPanel } from "@/components/ai-panel";
import { HealthScoreContent } from "@/components/health/health-score-content";
import { Skeleton } from "@/components/ui/skeleton";
import { generateHealthScore } from "@/app/actions/health-score";
import { healthScoreSchema, type HealthScoreOutput } from "@/lib/ai/schemas";

export type HealthScorePanelAnalysis = {
  createdAt: Date;
  model: string;
  dataAsOf: Date;
  output: HealthScoreOutput;
};

/**
 * Turn a stored AiAnalysis row into what HealthScorePanel needs, or null
 * when there is no row yet — or when a stored row's output no longer
 * matches the current schema (treated the same as "no analysis yet"; the
 * next explicit generate produces a fresh one, same fallback runAnalysis
 * itself uses on a hash-reuse hit whose stored shape has gone stale).
 */
export function parseHealthScoreAnalysis(
  row: AiAnalysis | null,
): HealthScorePanelAnalysis | null {
  if (!row) return null;
  const parsed = healthScoreSchema.safeParse(row.output);
  if (!parsed.success) return null;
  return {
    createdAt: row.createdAt,
    model: row.model,
    dataAsOf: row.dataAsOf,
    output: parsed.data,
  };
}

function HealthScoreSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-14 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HealthScorePanel({
  analysis,
  hasKey,
  className,
}: {
  analysis: HealthScorePanelAnalysis | null;
  hasKey: boolean;
  className?: string;
}) {
  return (
    <AiPanel
      title="Health Score"
      actionLabel={analysis ? "Re-analyze" : "Generate health score"}
      pendingLabel="Analyzing…"
      analysis={analysis}
      hasKey={hasKey}
      skeleton={<HealthScoreSkeleton />}
      onAction={generateHealthScore}
      className={className}
    >
      {analysis ? <HealthScoreContent output={analysis.output} /> : null}
    </AiPanel>
  );
}

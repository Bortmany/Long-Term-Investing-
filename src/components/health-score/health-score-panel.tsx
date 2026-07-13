"use client";

// The Portfolio Health Score panel — one component reused UNCHANGED by both
// the dashboard card and the /portfolio section, so the two always render the
// identical analysis. It wraps AiPanel and, on click, calls the
// generateHealthScore server action inside a transition; on success the server
// pages revalidate and hand back a fresher `analysis` prop.

import * as React from "react";

import { generateHealthScore } from "@/app/actions/health-score";
import type { HealthScoreOutput } from "@/lib/ai/schemas";
import { AiPanel } from "@/components/ai-panel";
import { HealthScoreBody } from "@/components/health-score/health-score-body";
import { Skeleton } from "@/components/ui/skeleton";

/** The persisted analysis, already parsed against healthScoreSchema on the server. */
export type HealthScorePanelAnalysis = {
  output: HealthScoreOutput;
  createdAt: Date;
  model: string;
  dataAsOf: Date;
};

export function HealthScorePanel({
  hasKey,
  analysis,
}: {
  hasKey: boolean;
  analysis: HealthScorePanelAnalysis | null;
}) {
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState(false);

  function handleGenerate() {
    setError(false);
    startTransition(async () => {
      const result = await generateHealthScore();
      if (!result.ok) setError(true);
      // On success the action revalidates /dashboard and /portfolio, so the
      // server page re-renders with the new `analysis` prop — nothing to set
      // here.
    });
  }

  return (
    <AiPanel
      title="Health Score"
      actionLabel={analysis ? "Re-analyze" : "Generate health score"}
      pendingLabel="Analyzing…"
      onAction={handleGenerate}
      analysis={
        analysis
          ? {
              createdAt: analysis.createdAt,
              model: analysis.model,
              dataAsOf: analysis.dataAsOf,
            }
          : null
      }
      isPending={isPending}
      hasKey={hasKey}
      error={error}
      pendingSkeleton={<HealthScoreSkeleton />}
    >
      {analysis ? <HealthScoreBody output={analysis.output} /> : null}
    </AiPanel>
  );
}

/** First-run placeholder shaped like the Health Score body (hero + 7 tiles). */
function HealthScoreSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-16 w-32" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

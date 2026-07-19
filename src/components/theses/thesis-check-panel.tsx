"use client";

// The "Latest Check" AiPanel for /theses/[id] (ui-spec §5.2, THESIS_CHECK).
// The hero integrity score and its recommendation are AI judgments, not
// fetched/derived figures — per §2.5's caption rule they carry NO
// SourceBadge; their provenance is the AiPanel caption line alone.
import { Circle } from "lucide-react";

import { checkThesis } from "@/app/actions/theses";
import { AiPanel, type AiPanelAnalysis } from "@/components/ai-panel";
import { ExplainerTip } from "@/components/explainer-tip";
import { Skeleton } from "@/components/ui/skeleton";
import type { ThesisCheckOutput } from "@/lib/ai/schemas";
import { RecommendationChip } from "./recommendation-chip";

const SKELETON = (
  <div className="space-y-6">
    <div>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-2 h-10 w-24" />
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      ))}
    </div>
  </div>
);

function EvidenceColumn({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{heading}</h3>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              <Circle
                className="mt-1.5 size-1.5 shrink-0 fill-slate-400 text-slate-400"
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">None noted.</p>
      )}
    </div>
  );
}

export function ThesisCheckPanel({
  thesisId,
  hasKey,
  analysis,
  output,
}: {
  thesisId: string;
  hasKey: boolean;
  /** The persisted row's caption data, or null if none exists yet. */
  analysis: AiPanelAnalysis | null;
  /** The zod-validated structured output matching `analysis`, or null. */
  output: ThesisCheckOutput | null;
}) {
  return (
    <AiPanel
      title="Latest Check"
      actionLabel="Check thesis now"
      pendingLabel="Checking…"
      analysis={analysis}
      hasKey={hasKey}
      skeleton={SKELETON}
      onAction={() => checkThesis(thesisId)}
    >
      {output ? (
        <div className="space-y-6">
          <div>
            <p className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
              Integrity Score <ExplainerTip term="integrity-score" />
            </p>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-4xl font-semibold tabular-nums">
                {output.integrityScore}
              </span>
              <RecommendationChip recommendation={output.recommendation} />
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {output.summary}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <EvidenceColumn heading="Supporting" items={output.evidence.supporting} />
            <EvidenceColumn heading="Weakening" items={output.evidence.weakening} />
            <EvidenceColumn heading="Improving" items={output.evidence.improving} />
          </div>

          {output.watchItems.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold">Watch items</h3>
              <ul className="mt-2 list-inside list-disc text-sm">
                {output.watchItems.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </AiPanel>
  );
}

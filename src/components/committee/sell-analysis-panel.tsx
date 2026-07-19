"use client";

// The Sell Analysis AiPanel (ui-spec §6.4, SELL_ANALYSIS). Sell Score,
// reasons and counterarguments are all AI judgments — per §2.5's caption
// rule they carry NO SourceBadge; their provenance is the AiPanel caption
// line alone.
import { AlertCircle } from "lucide-react";

import { runSellAnalysis } from "@/app/actions/committee";
import { AiPanel, type AiPanelAnalysis } from "@/components/ai-panel";
import { EvidenceList } from "@/components/evidence-list";
import { ExplainerTip } from "@/components/explainer-tip";
import { Skeleton } from "@/components/ui/skeleton";
import type { SellAnalysisOutput } from "@/lib/ai/schemas";

const SKELETON = (
  <div className="space-y-6">
    <Skeleton className="h-14 w-24" />
    <div className="space-y-2">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
    <div className="space-y-2">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-full" />
    </div>
  </div>
);

export function SellAnalysisPanel({
  instrumentId,
  hasKey,
  analysis,
  output,
  readOnly = false,
}: {
  instrumentId: string;
  hasKey: boolean;
  analysis: AiPanelAnalysis | null;
  output: SellAnalysisOutput | null;
  readOnly?: boolean;
}) {
  return (
    <AiPanel
      title="Sell Analysis"
      actionLabel="Run Sell Analysis"
      pendingLabel="Analyzing…"
      analysis={analysis}
      hasKey={hasKey}
      readOnly={readOnly}
      skeleton={SKELETON}
      onAction={() => runSellAnalysis(instrumentId)}
    >
      {output ? (
        <div className="space-y-6">
          <div>
            <p className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
              Sell Score <ExplainerTip term="sell-score" />
            </p>
            <p className="mt-1 text-5xl font-semibold tabular-nums">{output.sellScore}</p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Reasons to Sell</h3>
            {output.reasons.length > 0 ? (
              <EvidenceList items={output.reasons} />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">None noted.</p>
            )}
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <AlertCircle className="size-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              Counterarguments
            </h3>
            {output.counterarguments.length > 0 ? (
              <EvidenceList items={output.counterarguments} />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">None noted.</p>
            )}
          </div>
        </div>
      ) : null}
    </AiPanel>
  );
}

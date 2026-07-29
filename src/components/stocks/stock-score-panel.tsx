"use client";

// Health Score AiPanel for /stocks/[id] (ui-spec §4.2, STOCK_SCORE). The
// hero score and subscores are AI judgments, not fetched/derived figures —
// per §2.5's caption rule they carry NO SourceBadge; their provenance is the
// AiPanel caption line alone.
import { Check } from "lucide-react";

import { generateStockScore } from "@/app/actions/stocks";
import { AiPanel, type AiPanelAnalysis } from "@/components/ai-panel";
import { EvidenceList } from "@/components/evidence-list";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { StockScoreOutput } from "@/lib/ai/schemas";

const SUBSCORE_LABELS: Record<keyof StockScoreOutput["subscores"], string> = {
  diversification: "Diversification",
  valuation: "Valuation",
  quality: "Quality",
  concentration: "Concentration",
  dividendQuality: "Dividend Quality",
  risk: "Risk",
  cash: "Cash",
};

function scoreBand(score: number): "Strong" | "Moderate" | "Weak" {
  if (score >= 70) return "Strong";
  if (score >= 40) return "Moderate";
  return "Weak";
}

const SKELETON = (
  <div className="space-y-6">
    <div>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-14 w-24" />
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-1 h-6 w-10" />
        </div>
      ))}
    </div>
  </div>
);

export function StockScorePanel({
  instrumentId,
  hasKey,
  analysis,
  output,
}: {
  instrumentId: string;
  hasKey: boolean;
  /** The persisted row's caption data, or null if none exists yet. */
  analysis: AiPanelAnalysis | null;
  /** The zod-validated structured output matching `analysis`, or null. */
  output: StockScoreOutput | null;
}) {
  return (
    <AiPanel
      title="Health Score"
      actionLabel={analysis ? "Re-analyze" : "Generate investment score"}
      pendingLabel="Analyzing…"
      analysis={analysis}
      hasKey={hasKey}
      skeleton={SKELETON}
      onAction={() => generateStockScore(instrumentId)}
    >
      {output ? (
        <div className="space-y-6">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Health Score
            </p>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-4xl font-semibold tracking-tight leading-tight tabular-nums">
                {output.score}
              </span>
              <Badge variant="secondary">{scoreBand(output.score)}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              Object.keys(
                SUBSCORE_LABELS,
              ) as (keyof StockScoreOutput["subscores"])[]
            ).map((key) => (
              <div key={key}>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {SUBSCORE_LABELS[key]}
                </p>
                <p className="text-xl font-semibold tabular-nums">
                  {output.subscores[key]}
                </p>
              </div>
            ))}
          </div>

          {output.strengths.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Strengths</h3>
              <ul className="space-y-1">
                {output.strengths.map((strength, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-slate-500 dark:text-slate-400"
                      aria-hidden="true"
                    />
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {output.recommendations.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Recommendations</h3>
              {/* EvidenceList only has room for point + evidence[] (ui-spec §2.5);
                  the schema's extra `reasoning` field is folded into the evidence
                  list as its first line so none of the AI's stated content is
                  dropped from view. */}
              <EvidenceList
                items={output.recommendations.map((r) => ({
                  point: r.recommendation,
                  evidence: [r.reasoning, ...r.evidence],
                }))}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </AiPanel>
  );
}

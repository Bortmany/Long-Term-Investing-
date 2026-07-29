// The structured body of a Health Score AiPanel, once an analysis exists
// (ui-spec-phases-2-6.md §4.2 "Health Score panel" — the same 0-100 +
// 7-subscore + strengths + recommendations shape STOCK_SCORE reuses at the
// instrument level, per schemas.ts). Built once here; the /stocks/[id]
// builder can reuse this unchanged since StockScoreOutput is structurally
// identical to HealthScoreOutput.
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EvidenceList, type EvidenceListItem } from "@/components/evidence-list";
import { ExplainerTip } from "@/components/explainer-tip";
import type { HealthScoreOutput } from "@/lib/ai/schemas";

const SUBSCORE_LABELS: Record<keyof HealthScoreOutput["subscores"], string> = {
  diversification: "Diversification",
  valuation: "Valuation",
  quality: "Quality",
  concentration: "Concentration",
  dividendQuality: "Dividend Quality",
  risk: "Risk",
  cash: "Cash",
};

const SUBSCORE_KEYS = Object.keys(SUBSCORE_LABELS) as (keyof HealthScoreOutput["subscores"])[];

/** Fixed thresholds, text only — no color banding (0-100 scores are never green/red). */
function scoreBandLabel(score: number): string {
  if (score >= 70) return "Strong";
  if (score >= 40) return "Moderate";
  return "Weak";
}

export function HealthScoreContent({
  output,
  heroLabel = "Health Score",
}: {
  output: HealthScoreOutput;
  /** "Health Score" (portfolio) or "Investment Score" (a single stock) — same shape either way. */
  heroLabel?: string;
}) {
  // The schema pairs each recommendation with its own `reasoning`, one level
  // richer than EvidenceList's fixed { point, evidence[] } shape. Rather than
  // change the shared component (spec: "build once ... every later phase
  // imports them unchanged"), the reasoning is folded in as the first
  // evidence-styled line, ahead of the AI's cited evidence.
  const recommendationItems: EvidenceListItem[] = output.recommendations.map((r) => ({
    point: r.recommendation,
    evidence: [r.reasoning, ...r.evidence],
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
          {heroLabel} <ExplainerTip term="health-score" />
        </p>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-4xl font-semibold tracking-tight leading-tight tabular-nums">{output.score}</span>
          <Badge variant="secondary">{scoreBandLabel(output.score)}</Badge>
        </div>
      </div>

      <div>
        <h3 className="mb-2 inline-flex items-center gap-1 text-sm font-semibold">
          Subscores <ExplainerTip term="health-subscores" />
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SUBSCORE_KEYS.map((key) => (
            <div key={key}>
              <p className="text-xs text-slate-500 dark:text-slate-400">{SUBSCORE_LABELS[key]}</p>
              <p className="text-xl font-semibold tabular-nums">{output.subscores[key]}</p>
            </div>
          ))}
        </div>
      </div>

      {output.strengths.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">Strengths</h3>
          <ul className="mt-2 space-y-1.5">
            {output.strengths.map((strength, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span>{strength}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {output.recommendations.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">Recommendations</h3>
          <div className="mt-2">
            <EvidenceList items={recommendationItems} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

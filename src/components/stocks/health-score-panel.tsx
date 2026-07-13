"use client";

// The stock detail page's AI Health Score panel (ui-spec §4.2). A thin client
// wrapper around the shared AiPanel: it holds the pending/error state and, on
// the user's explicit click, calls the generateStockScore server action —
// runAnalysis is NEVER triggered by rendering (AI rule). The server page reads
// the persisted row and passes it (plus the parsed output) down here.
//
// None of the AI-computed numbers carry a SourceBadge (§4.2 note) — their
// provenance is the AiPanel caption line, the AI-specific form of the golden
// rule.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { generateStockScore } from "@/app/actions/stock-score";
import { AiPanel, type AiPanelAnalysis } from "@/components/ai-panel";
import { EvidenceList } from "@/components/evidence-list";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { StockScoreOutput } from "@/lib/ai/schemas";

const SUBSCORE_TILES: { key: keyof StockScoreOutput["subscores"]; label: string }[] = [
  { key: "diversification", label: "Diversification" },
  { key: "valuation", label: "Valuation" },
  { key: "quality", label: "Quality" },
  { key: "concentration", label: "Concentration" },
  { key: "dividendQuality", label: "Dividend Quality" },
  { key: "risk", label: "Risk" },
  { key: "cash", label: "Cash" },
];

const scoreFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Fixed thresholds, text only — no color banding (§4.2). */
function bandLabel(score: number): string {
  if (score >= 70) return "Strong";
  if (score >= 40) return "Moderate";
  return "Weak";
}

export function HealthScorePanel({
  instrumentId,
  hasKey,
  analysis,
  output,
}: {
  instrumentId: string;
  hasKey: boolean;
  analysis: AiPanelAnalysis | null;
  /** The parsed, persisted STOCK_SCORE output, or null if none exists yet. */
  output: StockScoreOutput | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState(false);

  function onAction() {
    setError(false);
    startTransition(async () => {
      const result = await generateStockScore(instrumentId);
      if (!result.ok) {
        setError(true);
        return;
      }
      // Pull the freshly persisted row back through the server component.
      router.refresh();
    });
  }

  return (
    <AiPanel
      title="Health Score"
      actionLabel={analysis ? "Re-analyze" : "Generate investment score"}
      pendingLabel="Analyzing…"
      onAction={onAction}
      analysis={analysis}
      isPending={isPending}
      hasKey={hasKey}
      error={error}
      pendingSkeleton={<ScoreSkeleton />}
    >
      {output ? <ScoreBody output={output} /> : null}
    </AiPanel>
  );
}

function ScoreBody({ output }: { output: StockScoreOutput }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Hero: big neutral number + a plain text band badge, no color banding. */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Health Score</p>
          <p className="text-6xl font-semibold tabular-nums">
            {scoreFormatter.format(output.score)}
          </p>
        </div>
        <Badge variant="secondary" className="mb-2">
          {bandLabel(output.score)}
        </Badge>
      </div>

      {/* 7 subscore tiles — neutral, no color. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SUBSCORE_TILES.map((tile) => (
          <div
            key={tile.key}
            className="rounded-lg border border-border p-3"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">{tile.label}</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">
              {scoreFormatter.format(output.subscores[tile.key])}
            </p>
          </div>
        ))}
      </div>

      {/* Strengths — plain bullets with a Check icon, no evidence sub-items. */}
      {output.strengths.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">Strengths</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {output.strengths.map((strength, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
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

      {/* Recommendations — point + supporting evidence via the shared list. */}
      {output.recommendations.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">Recommendations</h3>
          <div className="mt-2">
            <EvidenceList items={output.recommendations} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScoreSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-16 w-32" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

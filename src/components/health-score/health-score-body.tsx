// The structured Health Score content that renders inside AiPanel once an
// analysis exists (ui-spec §4.2). Everything here is an AI JUDGMENT: the hero
// score and the seven subscores carry NO SourceBadge — their provenance is
// AiPanel's caption line, not a market-data badge. Numbers are plain neutral
// (text only, no color banding, no gauge widget), per §2.6.

import { Check } from "lucide-react";

import type { HealthScoreOutput } from "@/lib/ai/schemas";
import { EvidenceList } from "@/components/evidence-list";
import { Badge } from "@/components/ui/badge";

/** Fixed thresholds (§4.2): ≥70 Strong, 40–69 Moderate, <40 Weak — text only. */
function bandLabel(score: number): "Strong" | "Moderate" | "Weak" {
  if (score >= 70) return "Strong";
  if (score >= 40) return "Moderate";
  return "Weak";
}

/** The seven subscores, in the fixed order and with the fixed labels from §4.2. */
const SUBSCORE_TILES: { key: keyof HealthScoreOutput["subscores"]; label: string }[] = [
  { key: "diversification", label: "Diversification" },
  { key: "valuation", label: "Valuation" },
  { key: "quality", label: "Quality" },
  { key: "concentration", label: "Concentration" },
  { key: "dividendQuality", label: "Dividend Quality" },
  { key: "risk", label: "Risk" },
  { key: "cash", label: "Cash" },
];

export function HealthScoreBody({ output }: { output: HealthScoreOutput }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Hero — big neutral number + plain text band label. */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Health Score</p>
          <p className="text-6xl font-semibold tabular-nums">{Math.round(output.score)}</p>
        </div>
        <Badge variant="secondary" className="mb-2">
          {bandLabel(output.score)}
        </Badge>
      </div>

      {/* Seven subscore tiles — neutral, no color, no badge. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SUBSCORE_TILES.map((tile) => (
          <div key={tile.key}>
            <p className="text-xs text-slate-500 dark:text-slate-400">{tile.label}</p>
            <p className="text-xl font-semibold tabular-nums">
              {Math.round(output.subscores[tile.key])}
            </p>
          </div>
        ))}
      </div>

      {/* Strengths — plain bullets, Check icon, no evidence sub-items. */}
      {output.strengths.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Strengths</h3>
          <ul className="flex flex-col gap-1.5">
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

      {/* Recommendations — point + evidence via the shared EvidenceList. */}
      {output.recommendations.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Recommendations</h3>
          <EvidenceList items={output.recommendations} />
        </div>
      ) : null}
    </div>
  );
}

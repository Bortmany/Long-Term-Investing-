// Presentational bodies for the three Committee result panels (ui-spec
// §6.2-§6.4). Free of client-only hooks so both the live workspace (Client
// Component) and the read-only /committee/history/[id] page (Server
// Component) can render these unchanged.
//
// Color rule (§2.6): BUY/HOLD/SELL verdicts and per-persona recommendations
// are ALWAYS neutral slate + icon, never green/red — that's reserved for
// genuine signed return figures (Margin of Safety, Upside/Downside case).
import { AlertCircle, GitBranch, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { SourceBadge, type SourceBadgeProps } from "@/components/source-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EvidenceList } from "@/components/evidence-list";
import {
  COMMITTEE_PERSONAS,
  type BuyAnalysisOutput,
  type CommitteeOutput,
  type CommitteePersona,
  type SellAnalysisOutput,
} from "@/lib/ai/schemas";
import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const PERSONA_LABEL: Record<CommitteePersona, string> = {
  value: "Value",
  growth: "Growth",
  dividend: "Dividend",
  quality: "Quality",
  macro: "Macro",
  contrarian: "Contrarian",
};

const VERDICT_ICON = {
  BUY: TrendingUp,
  HOLD: Minus,
  SELL: TrendingDown,
} as const;

/** Neutral BUY/HOLD/SELL chip — icon distinguishes, never color (§2.6). */
export function VerdictChip({
  verdict,
  size = "default",
}: {
  verdict: "BUY" | "HOLD" | "SELL";
  size?: "default" | "lg";
}) {
  const Icon = VERDICT_ICON[verdict];
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-normal text-slate-900 dark:text-slate-50",
        size === "lg" && "px-4 py-1.5 text-lg",
      )}
    >
      <Icon className={size === "lg" ? "size-5" : "size-3"} aria-hidden="true" />
      {verdict}
    </Badge>
  );
}

/** ui-spec §6.2 — the full Investment Committee result. */
export function CommitteeResultBody({ output }: { output: CommitteeOutput }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Verdict header */}
      <div className="flex flex-wrap items-center gap-3">
        <VerdictChip verdict={output.verdict} size="lg" />
        <span className="text-sm text-slate-600 dark:text-slate-400">
          Consensus:{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {output.consensusScore}
          </span>
          /100
        </span>
      </div>

      {/* Committee table — six personas */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Persona</TableHead>
            <TableHead>Recommendation</TableHead>
            <TableHead className="text-right">Confidence</TableHead>
            <TableHead>Strongest Point</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {COMMITTEE_PERSONAS.map((persona) => {
            const p = output.personas[persona];
            return (
              <TableRow key={persona}>
                <TableCell className="font-medium">{PERSONA_LABEL[persona]}</TableCell>
                <TableCell>
                  <VerdictChip verdict={p.recommendation} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.confidence}/100
                </TableCell>
                <TableCell className="whitespace-normal text-sm">{p.reasoning}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Disagreements — visually prominent, never collapsed or hidden. */}
      <div className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          <h3 className="text-base font-semibold">Where the committee disagreed</h3>
        </div>
        {output.disagreements.length > 0 ? (
          <ul className="mt-2 list-inside list-disc text-sm">
            {output.disagreements.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            No meaningful disagreement among the personas this run.
          </p>
        )}
      </div>

      {/* What would change this verdict */}
      <div>
        <h3 className="text-sm font-semibold">What would change this verdict</h3>
        {output.wouldChangeVerdict.length > 0 ? (
          <ul className="mt-2 list-inside list-disc text-sm">
            {output.wouldChangeVerdict.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">None noted.</p>
        )}
      </div>

      {/* Thesis Assessment — omitted entirely (not shown empty) when absent. */}
      {output.thesisAssessment ? (
        <div>
          <h3 className="text-sm font-semibold">Thesis Assessment</h3>
          <p className="mt-2 text-sm leading-relaxed">{output.thesisAssessment}</p>
        </div>
      ) : null}
    </div>
  );
}

/** ui-spec §6.3 — a prospective Buy Analysis result. */
export function BuyResultBody({
  output,
  currentPrice,
}: {
  output: BuyAnalysisOutput;
  currentPrice: {
    price: number;
    currency: string;
    badge: Pick<SourceBadgeProps, "variant" | "date">;
  } | null;
}) {
  const marginColor =
    output.marginOfSafety > 0
      ? "text-green-600 dark:text-green-400"
      : output.marginOfSafety < 0
        ? "text-red-600 dark:text-red-400"
        : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* Current Price — the ONE figure here that is real market data, not an
          AI output; everything else in this panel gets no SourceBadge. */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500 dark:text-slate-400">Current Price:</span>
        {currentPrice ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="tabular-nums">
              {formatMoney(currentPrice.price, currentPrice.currency)}
            </span>
            <SourceBadge size="sm" {...currentPrice.badge} />
          </span>
        ) : (
          <span className="text-amber-700 dark:text-amber-400">Price unavailable</span>
        )}
      </div>

      {/* Buy Score hero — neutral 0-100, not a return figure. */}
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Buy Score</p>
        <p className="text-5xl font-semibold tabular-nums">{output.score}</p>
      </div>

      {/* Fair Value + its assumptions, verbatim from the AI output. */}
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Fair Value Estimate</p>
        <p className="text-2xl font-semibold tabular-nums">
          {currentPrice
            ? formatMoney(output.fairValueEstimate.value, currentPrice.currency)
            : output.fairValueEstimate.value}
        </p>
        {output.fairValueEstimate.assumptions.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-0.5">
            {output.fairValueEstimate.assumptions.map((assumption, i) => (
              <li key={i} className="text-xs text-slate-500 dark:text-slate-400">
                {assumption}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Margin of Safety — a genuine price-vs-value comparison (§2.6). */}
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Margin of Safety</p>
        <p className={cn("text-xl font-semibold tabular-nums", marginColor)}>
          {formatPercent(output.marginOfSafety, { signed: true })}
        </p>
      </div>

      {/* Upside / Downside case tiles. */}
      <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Upside case</p>
          <p className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400">
            {formatPercent(Math.abs(output.upside), { signed: true })}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Downside case</p>
          <p className="text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
            {formatPercent(-Math.abs(output.downside), { signed: true })}
          </p>
        </div>
      </div>

      {/* Suggested allocation — plain line, never a bare figure standing in
          for a real allocation decision. */}
      <p className="text-sm">
        Suggested position size: {output.suggestedAllocationPct}% of portfolio.
      </p>

      {/* Alternatives */}
      {output.alternatives.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">Alternatives</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {output.alternatives.map((alt, i) => (
              <li key={i} className="text-sm">
                <span className="font-mono font-medium">{alt.ticker}</span>{" "}
                <span className="text-slate-600 dark:text-slate-400">{alt.why}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** ui-spec §6.4 — a Sell Analysis result. */
export function SellResultBody({ output }: { output: SellAnalysisOutput }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Sell Score hero — same tile pattern as Buy Score, neutral 0-100. */}
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Sell Score</p>
        <p className="text-5xl font-semibold tabular-nums">{output.sellScore}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Reasons to Sell</h3>
        <div className="mt-2">
          <EvidenceList items={output.reasons} />
        </div>
      </div>

      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <AlertCircle className="size-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          Counterarguments
        </h3>
        <div className="mt-2">
          <EvidenceList items={output.counterarguments} />
        </div>
      </div>
    </div>
  );
}

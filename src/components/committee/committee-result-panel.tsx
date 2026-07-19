"use client";

// The Committee AiPanel (ui-spec §6.2, COMMITTEE). The verdict, consensus
// score, and every persona judgment are AI output — per §2.5's caption rule
// they carry NO SourceBadge; their provenance is the AiPanel caption alone.
import { GitBranch } from "lucide-react";

import { conveneCommittee } from "@/app/actions/committee";
import { AiPanel, type AiPanelAnalysis } from "@/components/ai-panel";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CommitteeOutput, CommitteePersona } from "@/lib/ai/schemas";
import { VerdictChip } from "./verdict-chip";

const PERSONA_LABELS: Record<CommitteePersona, string> = {
  value: "Value",
  growth: "Growth",
  dividend: "Dividend",
  quality: "Quality",
  macro: "Macro",
  contrarian: "Contrarian",
};

const SKELETON = (
  <div className="space-y-6">
    <div className="flex items-center gap-3">
      <Skeleton className="h-9 w-24" />
      <Skeleton className="h-5 w-32" />
    </div>
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
    <Skeleton className="h-28 w-full" />
  </div>
);

export function CommitteeResultPanel({
  instrumentId,
  hasKey,
  analysis,
  output,
  readOnly = false,
}: {
  instrumentId: string;
  hasKey: boolean;
  /** The persisted row's caption data, or null if none exists yet. */
  analysis: AiPanelAnalysis | null;
  /** The zod-validated structured output matching `analysis`, or null. */
  output: CommitteeOutput | null;
  /** Historical read-only view (src/app/(app)/committee/history/[id]/page.tsx) — hides the action button. */
  readOnly?: boolean;
}) {
  return (
    <AiPanel
      title="Investment Committee"
      actionLabel="Convene Committee"
      pendingLabel="Convening…"
      analysis={analysis}
      hasKey={hasKey}
      readOnly={readOnly}
      skeleton={SKELETON}
      onAction={() => conveneCommittee(instrumentId)}
    >
      {output ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <VerdictChip verdict={output.verdict} size="lg" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Consensus:{" "}
              <span className="tabular-nums font-medium text-slate-900 dark:text-slate-50">
                {output.consensusScore}/100
              </span>
            </span>
          </div>

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
              {output.votes.map((vote) => (
                <TableRow key={vote.persona}>
                  <TableCell className="font-medium">{PERSONA_LABELS[vote.persona]}</TableCell>
                  <TableCell>
                    <VerdictChip verdict={vote.recommendation} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {vote.confidence}/100
                  </TableCell>
                  <TableCell className="text-sm whitespace-normal">{vote.reasoning}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Disagreements panel — visually prominent, NEVER collapsed or hidden by
              default (ui-spec §6.2). "What would change this verdict" lives inside
              the same block. */}
          <div className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <GitBranch className="size-4" aria-hidden="true" />
              Where the committee disagreed
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
              {output.disagreements.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>

            {output.wouldChangeVerdict.length > 0 ? (
              <div className="mt-4">
                <h4 className="text-sm font-semibold">What would change this verdict</h4>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                  {output.wouldChangeVerdict.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {output.thesisAssessment !== null ? (
            <div>
              <h3 className="text-sm font-semibold">Thesis Assessment</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {output.thesisAssessment}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </AiPanel>
  );
}

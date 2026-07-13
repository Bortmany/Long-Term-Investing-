"use client";

// The thesis detail page's "Latest Check" AI panel (ui-spec §5.2). A thin
// client wrapper around the shared AiPanel: it holds the pending/error state
// and, on the user's explicit click, calls the checkThesis server action —
// runAnalysis is NEVER triggered by rendering (AI rule). The server page
// reads the persisted latest ThesisCheck row and passes it (plus the parsed
// output) down here. Copies HealthScorePanel's structure exactly.
//
// The integrity score carries NO SourceBadge (§ contract) — its provenance
// is the AiPanel caption line, same as the Health Score hero number.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Circle, CircleCheck, CircleX, TriangleAlert } from "lucide-react";

import { checkThesis } from "@/app/actions/theses";
import { AiPanel, type AiPanelAnalysis } from "@/components/ai-panel";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ThesisCheckOutput } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

export function ThesisCheckPanel({
  thesisId,
  hasKey,
  analysis,
  output,
}: {
  thesisId: string;
  hasKey: boolean;
  analysis: AiPanelAnalysis | null;
  /** The parsed, persisted latest ThesisCheck output, or null if none exists yet. */
  output: ThesisCheckOutput | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState(false);

  function onAction() {
    setError(false);
    startTransition(async () => {
      const result = await checkThesis(thesisId);
      if (!result.ok) {
        setError(true);
        return;
      }
      router.refresh();
    });
  }

  return (
    <AiPanel
      title="Latest Check"
      actionLabel="Check thesis now"
      pendingLabel="Checking…"
      onAction={onAction}
      analysis={analysis}
      isPending={isPending}
      hasKey={hasKey}
      error={error}
      pendingSkeleton={<CheckSkeleton />}
    >
      {output ? <CheckBody output={output} /> : null}
    </AiPanel>
  );
}

const RECOMMENDATION_META = {
  INTACT: {
    icon: CircleCheck,
    className: "text-slate-900 dark:text-slate-50",
  },
  BROKEN: {
    icon: CircleX,
    className: "text-slate-900 dark:text-slate-50",
  },
  WEAKENING: {
    // The one legitimate amber reuse per §2.6 — WEAKENING genuinely is a
    // "needs attention" state.
    icon: TriangleAlert,
    className:
      "border-amber-600/30 bg-amber-50 text-amber-600 dark:border-amber-400/30 dark:bg-amber-950 dark:text-amber-400",
  },
} as const;

export function RecommendationBadge({
  recommendation,
}: {
  recommendation: ThesisCheckOutput["recommendation"];
}) {
  const meta = RECOMMENDATION_META[recommendation];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", meta.className)}>
      <Icon className="size-3" aria-hidden="true" />
      {recommendation.charAt(0) + recommendation.slice(1).toLowerCase()}
    </Badge>
  );
}

function EvidenceColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Circle
                className="mt-1 size-2 shrink-0 fill-current text-slate-400 dark:text-slate-500"
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

function CheckBody({ output }: { output: ThesisCheckOutput }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Hero: big neutral number, no color banding (same reasoning as
          Health Score's hero). */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Integrity Score</p>
          <p className="text-4xl font-semibold tabular-nums">{output.integrityScore}</p>
        </div>
        <div className="mb-1">
          <RecommendationBadge recommendation={output.recommendation} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <EvidenceColumn title="Supporting" items={output.evidence.supporting} />
        <EvidenceColumn title="Weakening" items={output.evidence.weakening} />
        <EvidenceColumn title="Improving" items={output.evidence.improving} />
      </div>

      {output.watchItems.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">Watch items</h3>
          <ul className="list-inside list-disc text-sm">
            {output.watchItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CheckSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-12 w-24" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

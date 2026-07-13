"use client";

// The stock detail page's AI "Recent News" panel (ui-spec §7.2 / Phase 6).
// A thin client wrapper around the shared AiPanel, following the exact
// pattern of health-score-panel.tsx: it holds the pending/error state and,
// on the user's explicit click, calls the generateNewsSummary server
// action — runAnalysis is NEVER triggered by rendering (AI rule). The
// server page reads the persisted NEWS_SUMMARY row and passes it (plus the
// parsed output) down here.
import * as React from "react";
import { useRouter } from "next/navigation";

import { generateNewsSummary } from "@/app/actions/reviews";
import { AiPanel, type AiPanelAnalysis } from "@/components/ai-panel";
import type { NewsSummaryOutput } from "@/lib/ai/schemas";

export function NewsSummaryPanel({
  instrumentId,
  hasKey,
  analysis,
  output,
}: {
  instrumentId: string;
  hasKey: boolean;
  analysis: AiPanelAnalysis | null;
  /** The parsed, persisted NEWS_SUMMARY output, or null if none exists yet. */
  output: NewsSummaryOutput | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState(false);

  function onAction() {
    setError(false);
    startTransition(async () => {
      const result = await generateNewsSummary(instrumentId);
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
      title="Recent News"
      actionLabel="Refresh news"
      pendingLabel="Refreshing…"
      onAction={onAction}
      analysis={analysis}
      isPending={isPending}
      hasKey={hasKey}
      error={error}
    >
      {output ? <NewsBody output={output} /> : null}
    </AiPanel>
  );
}

function NewsBody({ output }: { output: NewsSummaryOutput }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">What Happened</h3>
        <p className="mt-1 text-sm leading-relaxed">{output.whatHappened}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Why It Matters</h3>
        <p className="mt-1 text-sm leading-relaxed">{output.whyItMatters}</p>
      </div>

      {/* Omitted entirely (not shown empty) when there's no active thesis for
          this instrument — matching Committee's thesis-assessment omission
          rule (§6.2). */}
      {output.thesisImpact ? (
        <div>
          <h3 className="text-sm font-semibold">Thesis Impact</h3>
          <p className="mt-1 text-sm leading-relaxed">{output.thesisImpact}</p>
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold">Should You Care</h3>
        <p className="mt-1 text-sm font-medium leading-relaxed">
          {output.shouldInvestorCare}
        </p>
      </div>

      {output.quotes.length > 0 ? (
        <div className="flex flex-col gap-3">
          {output.quotes.map((quote, i) => (
            <div key={i}>
              <blockquote className="border-l-2 border-slate-300 pl-3 text-sm italic text-slate-600 dark:border-slate-700 dark:text-slate-400">
                {quote.text}
              </blockquote>
              {quote.source ? (
                <p className="mt-1 text-xs text-slate-400">— {quote.source}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

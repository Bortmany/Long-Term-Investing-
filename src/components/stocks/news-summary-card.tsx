"use client";

// The "Recent News" AiPanel for /stocks/[id] (ui-spec §7.2, NEWS_SUMMARY),
// filling the Phase 3 placeholder. All four sections are the model's own
// prose — no SourceBadge on any of them, per §2.5's caption rule; their
// provenance is the AiPanel caption line alone.
import { generateNewsSummary } from "@/app/actions/stocks";
import { AiPanel, type AiPanelAnalysis } from "@/components/ai-panel";
import { Skeleton } from "@/components/ui/skeleton";
import type { NewsSummaryOutput } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

const SKELETON = (
  <div className="space-y-4">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i}>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-full" />
        <Skeleton className="mt-1 h-3 w-5/6" />
      </div>
    ))}
  </div>
);

function Section({
  heading,
  body,
  emphasize = false,
}: {
  heading: string;
  body: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{heading}</h3>
      <p className={cn("mt-1 text-sm leading-relaxed", emphasize && "font-medium")}>{body}</p>
    </div>
  );
}

export function NewsSummaryCard({
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
  output: NewsSummaryOutput | null;
}) {
  return (
    <AiPanel
      title="Recent News"
      actionLabel="Refresh news"
      pendingLabel="Refreshing…"
      analysis={analysis}
      hasKey={hasKey}
      skeleton={SKELETON}
      onAction={() => generateNewsSummary(instrumentId)}
    >
      {output ? (
        <div className="space-y-4">
          <Section heading="What Happened" body={output.whatHappened} />
          <Section heading="Why It Matters" body={output.whyItMatters} />
          {output.thesisImpact !== null ? (
            <Section heading="Thesis Impact" body={output.thesisImpact} />
          ) : null}
          <Section heading="Should You Care" body={output.shouldInvestorCare} emphasize />

          {output.quotes.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold">Quotes</h3>
              <div className="mt-2 space-y-3">
                {output.quotes.map((quote, index) => (
                  <blockquote
                    key={index}
                    className="border-l-2 border-slate-300 pl-3 text-sm text-slate-600 italic dark:border-slate-700 dark:text-slate-400"
                  >
                    <p>{quote.quote}</p>
                    {quote.source ? (
                      <footer className="mt-1 text-xs text-slate-400 not-italic">
                        — {quote.source}
                      </footer>
                    ) : null}
                  </blockquote>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </AiPanel>
  );
}

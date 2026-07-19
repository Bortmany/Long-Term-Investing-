"use client";

// The Buy Analysis AiPanel (ui-spec §6.3, BUY_ANALYSIS). Current Price is the
// ONE figure in this panel that is real market data, not an AI output — it
// alone carries a SourceBadge; every other number here is an AI judgment and
// (per §2.5's caption rule) carries none.
//
// DECISION: AiPanel (built once in Phase 3, reused unchanged everywhere) only
// renders its `children` once a stored `analysis` exists — before that it
// shows its own "No analysis yet" placeholder. Current Price is real market
// data that should be visible immediately, independent of whether a Buy
// Analysis has ever been run, so it's rendered as its own small block ABOVE
// the AiPanel (not inside its gated children) rather than modifying the
// shared component for this one screen.
import { runBuyAnalysis } from "@/app/actions/committee";
import { AiPanel, type AiPanelAnalysis } from "@/components/ai-panel";
import { ExplainerTip } from "@/components/explainer-tip";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceBadge, type SourceBadgeProps } from "@/components/source-badge";
import { formatMoney, formatPercent } from "@/lib/format";
import type { BuyAnalysisOutput } from "@/lib/ai/schemas";

export type CurrentPriceInfo =
  | { ok: true; price: number; currency: string; badge: Pick<SourceBadgeProps, "variant" | "date"> }
  | { ok: false; reason: string };

const SKELETON = (
  <div className="space-y-6">
    <Skeleton className="h-4 w-32" />
    <Skeleton className="h-14 w-24" />
    <Skeleton className="h-8 w-40" />
    <div className="grid grid-cols-2 gap-4">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  </div>
);

/** Green/red for a genuine gain/loss comparison — margin of safety, upside, downside (§2.6). */
function signedPercentColor(value: number): string {
  if (value > 0) return "text-green-600 dark:text-green-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "";
}

export function BuyAnalysisPanel({
  instrumentId,
  instrumentCurrency,
  hasKey,
  analysis,
  output,
  currentPrice,
  readOnly = false,
}: {
  instrumentId: string;
  /** The instrument's own trading currency — always known server-side, unlike `currentPrice` which can be unavailable. */
  instrumentCurrency: string;
  hasKey: boolean;
  analysis: AiPanelAnalysis | null;
  output: BuyAnalysisOutput | null;
  currentPrice: CurrentPriceInfo;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Current Price</p>
        {currentPrice.ok ? (
          <p className="mt-1 flex items-center gap-2 text-lg font-medium tabular-nums">
            {formatMoney(currentPrice.price, currentPrice.currency)}
            <SourceBadge size="sm" {...currentPrice.badge} />
          </p>
        ) : (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
            Unavailable — {currentPrice.reason}
          </p>
        )}
      </div>

      <AiPanel
        title="Buy Analysis"
        actionLabel="Run Buy Analysis"
        pendingLabel="Analyzing…"
        analysis={analysis}
        hasKey={hasKey}
        readOnly={readOnly}
        skeleton={SKELETON}
        onAction={() => runBuyAnalysis(instrumentId)}
      >
        {output ? (
          <div className="space-y-6">
            <div>
              <p className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                Buy Score <ExplainerTip term="buy-score" />
              </p>
              <p className="mt-1 text-5xl font-semibold tabular-nums">{output.score}</p>
            </div>

            <div>
              <p className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                Fair Value <ExplainerTip term="fair-value" />
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatMoney(output.fairValueEstimate.value, instrumentCurrency)}
              </p>
              {output.fairValueEstimate.assumptions.length > 0 ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {output.fairValueEstimate.assumptions.join(" · ")}
                </p>
              ) : null}
            </div>

            <div>
              <p className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                Margin of Safety <ExplainerTip term="margin-of-safety" />
              </p>
              <p
                className={`mt-1 text-xl font-semibold tabular-nums ${signedPercentColor(output.marginOfSafetyPct)}`}
              >
                {formatPercent(output.marginOfSafetyPct, { signed: true })}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  Upside case <ExplainerTip term="upside-downside" />
                </p>
                <p
                  className={`mt-1 text-lg font-semibold tabular-nums ${signedPercentColor(output.upsidePct)}`}
                >
                  {formatPercent(output.upsidePct, { signed: true })}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  Downside case <ExplainerTip term="upside-downside" />
                </p>
                <p
                  className={`mt-1 text-lg font-semibold tabular-nums ${signedPercentColor(output.downsidePct)}`}
                >
                  {formatPercent(output.downsidePct, { signed: true })}
                </p>
              </div>
            </div>

            <p className="text-sm">
              <span className="inline-flex items-center gap-1">
                Suggested position size <ExplainerTip term="suggested-allocation" />
              </span>
              :{" "}
              <span className="font-medium tabular-nums">
                {formatPercent(output.suggestedAllocationPct)}
              </span>{" "}
              of the portfolio.
            </p>

            {output.alternatives.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Alternatives</h3>
                <ul className="space-y-1.5">
                  {output.alternatives.map((alt, index) => (
                    <li key={index} className="text-sm">
                      <span className="font-mono font-medium">{alt.ticker}</span>{" "}
                      <span className="text-slate-600 dark:text-slate-400">— {alt.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </AiPanel>
    </div>
  );
}

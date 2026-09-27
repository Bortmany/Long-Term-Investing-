"use client";

// AiPanel (ui-spec-phases-2-6.md §2.5) — the one container every persisted
// AiAnalysis result renders through. Built once in Phase 3; Phases 4, 5 and
// 6 import it unchanged for Committee, Thesis Check, Buy/Sell Analysis and
// Weekly Review.
//
// THE AI RULE (docs/CONVENTIONS.md): this panel never generates anything on
// render — `analysis` is whatever the server already has stored; `onAction`
// only runs when the owner clicks the button.
import * as React from "react";
import { LoaderCircle, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";

import { AiDisclaimer } from "@/components/ai-disclaimer";
import { ConnectKeyNotice } from "@/components/connect-key-notice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActionResult } from "@/lib/action-result";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The bit of a persisted AiAnalysis row the caption line needs. */
export type AiPanelAnalysis = {
  createdAt: Date;
  model: string;
  dataAsOf: Date;
};

export function AiPanel({
  title,
  actionLabel,
  pendingLabel,
  analysis,
  hasKey,
  readOnly = false,
  skeleton,
  children,
  onAction,
  className,
}: {
  title: React.ReactNode;
  /** Button text, e.g. "Convene Committee", "Generate investment score", "Re-analyze". */
  actionLabel: string;
  /** Present-participle label shown on the button while a run is in flight, e.g. "Analyzing…". */
  pendingLabel: string;
  /** The persisted analysis to show, or null if none exists yet. */
  analysis: AiPanelAnalysis | null;
  /** Whether ANTHROPIC_API_KEY is set server-side. */
  hasKey: boolean;
  /** Hides the action button entirely — used for viewing a specific historical run. */
  readOnly?: boolean;
  /** Shaped placeholder shown only for the very first run (no analysis yet, pending). */
  skeleton?: React.ReactNode;
  /** The analysis-specific structured body, rendered when `analysis` is not null. */
  children?: React.ReactNode;
  /** The server action to run when the button is clicked. */
  onAction?: () => Promise<ActionResult<unknown>>;
  className?: string;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const noticeId = React.useId();

  function handleAction() {
    if (!onAction || isPending || !hasKey) return;
    setError(null);
    startTransition(async () => {
      const result = await onAction();
      if (!result.ok) {
        setError(result.error);
      }
      // On success, the calling server action's revalidatePath refreshes
      // this page's data — the fresh `analysis` prop arrives via the normal
      // server-component re-render, never a client-side re-fetch here.
    });
  }

  // State 1: no key AND nothing stored — title only, no button, no caption,
  // no footer. When a stored analysis DOES exist it keeps rendering below
  // (with its caption and disclaimer): hiding real, already-saved results
  // would be the opposite of honest. Only the generate action goes away.
  if (!hasKey && !analysis) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <ConnectKeyNotice />
        </CardContent>
      </Card>
    );
  }

  const showButton = !readOnly;
  // With no key the button stays visible but disabled, and the notice below
  // the content says why. On a read-only historical view there's no button to
  // explain, so no notice either.
  const showKeyNotice = !hasKey && showButton;

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {showButton ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || !hasKey}
            aria-describedby={showKeyNotice ? noticeId : undefined}
            onClick={handleAction}
          >
            {isPending ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                {pendingLabel}
              </>
            ) : (
              <>
                <RefreshCw aria-hidden="true" />
                {actionLabel}
              </>
            )}
          </Button>
        ) : null}
      </CardHeader>

      {analysis ? (
        <p className="-mt-2 mb-2 px-6 text-xs text-slate-500 dark:text-slate-400">
          Analysis from {formatShortDate(analysis.createdAt)} · {analysis.model} · based
          on data as of {formatShortDate(analysis.dataAsOf)}
        </p>
      ) : null}

      {error ? (
        <div className="px-6">
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Analysis failed</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <CardContent>
        {analysis ? (
          <div className={cn(isPending && "pointer-events-none opacity-60")}>{children}</div>
        ) : isPending && skeleton ? (
          skeleton
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Sparkles className="size-6 text-slate-400" aria-hidden="true" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No analysis yet. Click &apos;{actionLabel}&apos; to generate one.
            </p>
          </div>
        )}

        {showKeyNotice ? (
          <div id={noticeId} className="mt-4">
            <ConnectKeyNotice />
          </div>
        ) : null}
      </CardContent>

      <CardFooter>
        <AiDisclaimer />
      </CardFooter>
    </Card>
  );
}

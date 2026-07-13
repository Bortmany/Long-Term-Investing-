// The one container every persisted AiAnalysis result renders through
// (ui-spec §2.5). Build once in Phase 3; Phases 4-6 import it unchanged.
"use client";

import type * as React from "react";
import { LoaderCircle, RefreshCw, Sparkles } from "lucide-react";

import { AiDisclaimer } from "@/components/ai-disclaimer";
import { ConnectKeyNotice } from "@/components/connect-key-notice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The subset of a persisted AiAnalysis row the caption line needs. */
export type AiPanelAnalysis = {
  createdAt: Date;
  model: string;
  dataAsOf: Date;
};

export type AiPanelProps = {
  /** CardTitle text. */
  title: string;
  /** Action button text in its normal (non-pending) state, e.g. "Convene Committee". */
  actionLabel: string;
  /** Present-participle label shown on the button while a run is in flight, e.g. "Convening…". */
  pendingLabel: string;
  onAction?: () => void;
  /** The persisted row, or null if none exists yet. */
  analysis: AiPanelAnalysis | null;
  /** A new run is in flight. */
  isPending?: boolean;
  /** Hides the action button entirely — used for viewing a specific historical run. */
  readOnly?: boolean;
  /** Whether ANTHROPIC_API_KEY is set server-side. */
  hasKey: boolean;
  /** Set when the most recent generation attempt failed (a string is accepted for callers that want to carry a message for their own logging — the copy shown to the user is always the fixed spec text). */
  error?: boolean | string;
  /** The analysis-specific body, rendered whenever `analysis` is present. */
  children?: React.ReactNode;
  /** Shape-matched Skeleton placeholder for the very first (no previous analysis) pending run. Falls back to a generic 3-line skeleton if not provided. */
  pendingSkeleton?: React.ReactNode;
};

export function AiPanel({
  title,
  actionLabel,
  pendingLabel,
  onAction,
  analysis,
  isPending = false,
  readOnly = false,
  hasKey,
  error,
  children,
  pendingSkeleton,
}: AiPanelProps) {
  // State 1: no key. Nothing else in this panel renders — no action button,
  // no caption, no footer (there is nothing shown to disclaim about).
  if (!hasKey) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <ConnectKeyNotice />
        </CardContent>
      </Card>
    );
  }

  const failed = Boolean(error) && !isPending;
  const showActionButton = !readOnly;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {showActionButton ? (
          <Button variant="outline" size="sm" onClick={onAction} disabled={isPending}>
            {isPending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            {isPending ? pendingLabel : actionLabel}
          </Button>
        ) : null}
      </CardHeader>

      {analysis ? (
        <p className="-mt-2 mb-2 px-6 text-xs text-slate-500 dark:text-slate-400">
          Analysis from {formatShortDate(analysis.createdAt)} · {analysis.model} · based on data as
          of {formatShortDate(analysis.dataAsOf)}
        </p>
      ) : null}

      {failed ? (
        <div className="px-6">
          <Alert variant="destructive">
            <AlertTitle>Analysis failed</AlertTitle>
            <AlertDescription>
              Something went wrong generating this analysis. Your previous analysis (if any) is
              unaffected.
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <CardContent>
        {isPending && !analysis ? (
          (pendingSkeleton ?? <DefaultPendingSkeleton />)
        ) : analysis ? (
          <div className={cn(isPending && "pointer-events-none opacity-60")}>{children}</div>
        ) : (
          <div className="flex flex-col items-center py-6 text-center">
            <Sparkles className="size-6 text-slate-400" aria-hidden="true" />
            <p className="mt-2 text-sm text-slate-500">
              No analysis yet. Click &apos;{actionLabel}&apos; to generate one.
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter>
        <AiDisclaimer />
      </CardFooter>
    </Card>
  );
}

function DefaultPendingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

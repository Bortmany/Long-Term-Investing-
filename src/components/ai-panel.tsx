"use client";

// AiPanel (ui-spec-phases-2-6.md §2.5) — the one container every persisted
// AiAnalysis result renders through. Built once in Phase 3; Phases 4, 5 and
// 6 import it unchanged for Committee, Thesis Check, Upside/Downside check and
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
import { AiLimitNotice } from "@/components/ai-limit-notice";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { inferAiLimitFromMessage, isAiLimitCode, type AiLimitCode } from "@/lib/ai/limit-messages";
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
  proNotice,
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
  /**
   * Set on Pro-only panels for a Free user (a ProFeatureNotice): it takes the
   * button's place. A stored analysis still renders in full below it.
   */
  proNotice?: React.ReactNode;
  className?: string;
}) {
  const [error, setError] = React.useState<string | null>(null);
  // A spend-limit refusal: shown as the calm grey AiLimitNotice, never as a
  // red error. It also switches the button off for the rest of this page
  // view (reloading re-enables it; the server always decides again).
  const [limit, setLimit] = React.useState<{
    code: AiLimitCode;
    message: string;
    upgradeHref?: string;
  } | null>(null);
  // A "part of Pro" refusal that arrived from the server (e.g. the plan
  // lapsed while this page was open) — also calm grey, not red.
  const [proRefusal, setProRefusal] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const noticeId = React.useId();
  const limitNoticeId = React.useId();

  function handleAction() {
    if (!onAction || isPending || !hasKey || limit) return;
    setError(null);
    setProRefusal(null);
    startTransition(async () => {
      const result = await onAction();
      if (!result.ok) {
        const inferred = isAiLimitCode(result.code)
          ? { code: result.code, upgradeHref: result.upgradeHref }
          : inferAiLimitFromMessage(result.error);
        if (inferred) {
          setLimit({ code: inferred.code, message: result.error, upgradeHref: inferred.upgradeHref });
        } else if (result.code === "PRO_REQUIRED") {
          setProRefusal(result.error);
        } else {
          setError(result.error);
        }
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

  // A Pro-only panel for a Free user has no button at all — the Pro notice
  // takes its place (the server refuses the action regardless).
  const showButton = !readOnly && !proNotice;
  // With no key the button stays visible but disabled, and the notice below
  // the content says why. On a read-only historical view there's no button to
  // explain, so no notice either.
  const showKeyNotice = !hasKey && showButton;

  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending || !hasKey || limit !== null}
      aria-describedby={showKeyNotice ? noticeId : limit ? limitNoticeId : undefined}
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
  );

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {showButton ? (
          limit ? (
            // A disabled button can't show a hover hint itself, so the hint
            // sits on a focusable wrapper around it.
            <Tooltip>
              <TooltipTrigger>{button}</TooltipTrigger>
              <TooltipContent side="bottom">Available again after the limit resets.</TooltipContent>
            </Tooltip>
          ) : (
            button
          )
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

      {/* Calm notices sit above the content; a stored analysis stays fully
          visible underneath them (16px gap). */}
      {limit || proRefusal || proNotice ? (
        <div className="space-y-4 px-6 pb-4">
          {proNotice}
          {limit ? (
            <AiLimitNotice
              id={limitNoticeId}
              code={limit.code}
              message={limit.message}
              upgradeHref={limit.upgradeHref}
            />
          ) : null}
          {proRefusal ? (
            <p
              role="status"
              className="max-w-2xl rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              {proRefusal}
            </p>
          ) : null}
        </div>
      ) : null}

      <CardContent>
        {analysis ? (
          <div className={cn(isPending && "pointer-events-none opacity-60")}>{children}</div>
        ) : isPending && skeleton ? (
          skeleton
        ) : limit || proRefusal || proNotice ? null : (
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

      {/* The disclaimer goes with shown content; a bare limit or Pro notice
          with nothing stored needs no disclaimer. */}
      {analysis || !(limit || proRefusal || proNotice) ? (
        <CardFooter>
          <AiDisclaimer />
        </CardFooter>
      ) : null}
    </Card>
  );
}

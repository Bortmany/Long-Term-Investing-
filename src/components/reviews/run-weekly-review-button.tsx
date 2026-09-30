"use client";

// "Run weekly review" — the /reviews page header trigger (ui-spec §7.1). Not
// wrapped in AiPanel (that chrome is for a single persisted analysis result;
// this button lives on the LIST page, not a result panel), same shape as
// src/components/theses/close-reopen-thesis-button.tsx: local pending state,
// inline error text, no dialog needed since there's nothing to confirm.
//
// Plans (go-public spec B1/B4): the weekly review is Pro. For a Free user the
// "part of Pro" notice takes the button's place (the server refuses the
// action regardless). A spend-limit refusal shows the calm grey limit notice,
// not red error text, and switches the button off for this page view.
import * as React from "react";
import Link from "next/link";
import { Check, LoaderCircle } from "lucide-react";

import { runWeeklyReview } from "@/app/actions/reviews";
import { AiLimitNotice } from "@/components/ai-limit-notice";
import { ProFeatureNotice } from "@/components/pro-feature-notice";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { inferAiLimitFromMessage, isAiLimitCode, type AiLimitCode } from "@/lib/ai/limit-messages";

export function RunWeeklyReviewButton({
  hasKey,
  proLocked = false,
  billingEnabled = false,
}: {
  /** Whether ANTHROPIC_API_KEY is set server-side. Required on purpose (no
   *  default): a caller that forgets it should fail the type check rather
   *  than quietly ship an enabled button with no key behind it. False leaves
   *  the button visibly disabled — the page's ConnectKeyNotice says why. */
  hasKey: boolean;
  /** Free user: show the "part of Pro" notice instead of the button. */
  proLocked?: boolean;
  /** From isBillingEnabled() on the server — picks the notice's wording. */
  billingEnabled?: boolean;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState<{
    code: AiLimitCode;
    message: string;
    upgradeHref?: string;
  } | null>(null);
  // Id of the review just generated — drives the inline success confirmation
  // (kept neutral slate, NOT green: green is reserved for financial gains).
  const [successId, setSuccessId] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  if (proLocked) {
    return <ProFeatureNotice billingEnabled={billingEnabled} className="w-full" />;
  }

  function handleClick() {
    if (!hasKey || limit) return;
    setError(null);
    setSuccessId(null);
    startTransition(async () => {
      const result = await runWeeklyReview();
      if (!result.ok) {
        const inferred = isAiLimitCode(result.code)
          ? { code: result.code, upgradeHref: result.upgradeHref }
          : inferAiLimitFromMessage(result.error);
        if (inferred) {
          setLimit({ code: inferred.code, message: result.error, upgradeHref: inferred.upgradeHref });
        } else {
          setError(result.error);
        }
        return;
      }
      setSuccessId(result.data.id);
      // On success, the action's revalidatePath("/reviews") refreshes this
      // page's data — the fresh list arrives via the normal server-component
      // re-render, never a client-side re-fetch here.
    });
  }

  const button = (
    <Button type="button" disabled={isPending || !hasKey || limit !== null} onClick={handleClick}>
      {isPending ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          Running…
        </>
      ) : (
        "Run weekly review"
      )}
    </Button>
  );

  return (
    <div className="flex flex-col items-end gap-1.5">
      {limit ? (
        <Tooltip>
          <TooltipTrigger>{button}</TooltipTrigger>
          <TooltipContent side="bottom">Available again after the limit resets.</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      {limit ? (
        <AiLimitNotice
          className="mt-2"
          code={limit.code}
          message={limit.message}
          upgradeHref={limit.upgradeHref}
        />
      ) : null}
      {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {successId ? (
        <p role="status" className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <Check className="size-4" aria-hidden="true" />
          Review generated —{" "}
          <Link
            href={`/reviews/${successId}`}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            view it
          </Link>
        </p>
      ) : null}
    </div>
  );
}

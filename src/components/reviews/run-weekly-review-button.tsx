"use client";

// "Run weekly review" — the /reviews page header trigger (ui-spec §7.1). Not
// wrapped in AiPanel (that chrome is for a single persisted analysis result;
// this button lives on the LIST page, not a result panel), same shape as
// src/components/theses/close-reopen-thesis-button.tsx: local pending state,
// inline error text, no dialog needed since there's nothing to confirm.
import * as React from "react";
import Link from "next/link";
import { Check, LoaderCircle } from "lucide-react";

import { runWeeklyReview } from "@/app/actions/reviews";
import { Button } from "@/components/ui/button";

export function RunWeeklyReviewButton() {
  const [error, setError] = React.useState<string | null>(null);
  // Id of the review just generated — drives the inline success confirmation
  // (kept neutral slate, NOT green: green is reserved for financial gains).
  const [successId, setSuccessId] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function handleClick() {
    setError(null);
    setSuccessId(null);
    startTransition(async () => {
      const result = await runWeeklyReview();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccessId(result.data.id);
      // On success, the action's revalidatePath("/reviews") refreshes this
      // page's data — the fresh list arrives via the normal server-component
      // re-render, never a client-side re-fetch here.
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button type="button" disabled={isPending} onClick={handleClick}>
        {isPending ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Running…
          </>
        ) : (
          "Run weekly review"
        )}
      </Button>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {successId ? (
        <p className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
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

"use client";

// "Run weekly review" — the /reviews page header trigger (ui-spec §7.1). Not
// wrapped in AiPanel (that chrome is for a single persisted analysis result;
// this button lives on the LIST page, not a result panel), same shape as
// src/components/theses/close-reopen-thesis-button.tsx: local pending state,
// inline error text, no dialog needed since there's nothing to confirm.
import * as React from "react";
import { LoaderCircle } from "lucide-react";

import { runWeeklyReview } from "@/app/actions/reviews";
import { Button } from "@/components/ui/button";

export function RunWeeklyReviewButton() {
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await runWeeklyReview();
      if (!result.ok) {
        setError(result.error);
      }
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
    </div>
  );
}

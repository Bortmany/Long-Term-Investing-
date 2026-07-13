"use client";

// The "Run weekly review" button (ui-spec §7.1). Used both in the /reviews
// page header and inside the empty-state's `action` slot — a single
// reusable component, not two copies. Mirrors the useTransition +
// server-action-call + router pattern from health-score-panel.tsx, except
// on success it navigates straight to the freshly generated/reused review
// (router.push) rather than refreshing in place — this button isn't
// attached to any AiPanel content on this page.
import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { runWeeklyReview } from "@/app/actions/reviews";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RunReviewButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState(false);

  function onClick() {
    setError(false);
    startTransition(async () => {
      const result = await runWeeklyReview();
      if (!result.ok) {
        setError(true);
        return;
      }
      router.push(`/reviews/${result.data.id}`);
    });
  }

  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <Button onClick={onClick} disabled={isPending}>
        {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
        {isPending ? "Running…" : "Run weekly review"}
      </Button>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          Something went wrong running this review.
        </p>
      ) : null}
    </div>
  );
}

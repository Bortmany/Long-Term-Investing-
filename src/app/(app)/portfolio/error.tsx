"use client";

// Portfolio-specific error state: if the page's data fails to load, the
// whole body becomes a destructive alert with a Retry that re-fetches.
// Never stale or placeholder numbers (golden rule) — the shell above stays
// usable so the owner can navigate away.
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function PortfolioError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center">
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>Couldn&apos;t load your portfolio</AlertTitle>
        <AlertDescription>
          <p>Something went wrong pulling your holdings and transactions.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            onClick={() => unstable_retry()}
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

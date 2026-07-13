"use client";

// Stock detail error state — the same full-page Alert + Retry pattern as the
// Dashboard (ui-spec §4.2). Never stale or placeholder numbers (golden rule);
// the app shell above stays usable.
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function StockDetailError({
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
        <AlertTitle>Couldn&apos;t load this stock</AlertTitle>
        <AlertDescription>
          <p>Something went wrong pulling this instrument&apos;s data.</p>
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

"use client";

// /reviews-specific error state: if the list fails to load, the whole body
// becomes a destructive alert with a Retry — same pattern as
// /theses/error.tsx. Never stale or placeholder numbers (golden rule).
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ReviewsError({
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
        <AlertTitle>Couldn&apos;t load your reviews</AlertTitle>
        <AlertDescription>
          <p>Something went wrong pulling your weekly reviews.</p>
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

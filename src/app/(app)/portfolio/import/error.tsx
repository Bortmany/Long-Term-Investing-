"use client";

// Error state for the CSV import screen — same destructive-alert-plus-retry
// pattern as the dashboard. Nothing was imported when this shows.
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ImportError({
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
        <AlertTitle>Couldn&apos;t load the import screen</AlertTitle>
        <AlertDescription>
          <p>Something went wrong opening the CSV import. Nothing was imported.</p>
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

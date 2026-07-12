"use client";

// Global error boundary (UI spec §7). Lives inside the (app) layout, so the
// sidebar / top bar stays visible and the user can still navigate away.
import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surface the error in the console for debugging; nothing user-facing.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col items-center justify-center text-center">
      <div className="flex size-[72px] items-center justify-center rounded-full bg-red-50 dark:bg-red-950">
        <TriangleAlert className="size-10 text-red-600 dark:text-red-400" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-xl font-semibold">Something went wrong.</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        This page hit an error and couldn&apos;t load. You can try again or head back
        to the dashboard.
      </p>
      <div className="mt-4 flex justify-center gap-3">
        <Button type="button" onClick={() => unstable_retry()}>
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

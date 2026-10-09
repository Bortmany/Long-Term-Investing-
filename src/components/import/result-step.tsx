"use client";

// Screen 4: the result of the real import (UI spec section 5).

import * as React from "react";
import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { plural } from "./check-model";

export type ImportOutcome =
  | { ok: true; imported: number; skipped: number; alreadyImported: number }
  | { ok: false; message: string };

export function ResultStep({
  outcome,
  onTryAgain,
  onImportAnother,
}: {
  outcome: ImportOutcome;
  onTryAgain: () => void;
  onImportAnother: () => void;
}) {
  if (outcome.ok) {
    const parts = [
      `${outcome.imported} ${plural(outcome.imported, "transaction", "transactions")} added.`,
    ];
    if (outcome.skipped > 0) parts.push(`${outcome.skipped} skipped.`);
    if (outcome.alreadyImported > 0) {
      parts.push(
        `${outcome.alreadyImported} ${plural(outcome.alreadyImported, "was", "were")} already in your portfolio.`,
      );
    }
    return (
      <div className="space-y-4">
        <Alert variant="success" className="max-w-xl">
          <CircleCheck aria-hidden="true" />
          <AlertTitle>Import complete</AlertTitle>
          <AlertDescription>
            <p>{parts.join(" ")}</p>
            <p>Your history is in.</p>
          </AlertDescription>
        </Alert>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/portfolio">Go to Portfolio</Link>
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={onImportAnother}>
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Import failed</AlertTitle>
      <AlertDescription>
        <p>
          Something went wrong saving these transactions. Nothing was imported. You can try
          again.
        </p>
        <p>{outcome.message}</p>
        <Button type="button" variant="outline" size="lg" className="mt-2" onClick={onTryAgain}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

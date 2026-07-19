"use client";

// Close/Reopen with a confirm dialog, on the /theses/[id] header. Not a
// destructive delete, so it doesn't reuse the exact confirm-delete copy
// (ui-spec §2.4), but follows the same shape: Dialog, a sentence naming the
// specific thesis, Cancel first + primary action last, disabled buttons +
// a spinner label while the request is in flight.
import * as React from "react";
import { LoaderCircle } from "lucide-react";
import type { ThesisStatus } from "@prisma/client";

import { closeThesis, reopenThesis } from "@/app/actions/theses";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CloseReopenThesisButton({
  thesisId,
  status,
  ticker,
}: {
  thesisId: string;
  status: ThesisStatus;
  ticker: string;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const isActive = status === "ACTIVE";
  const actionLabel = isActive ? "Close Thesis" : "Reopen Thesis";
  const pendingLabel = isActive ? "Closing…" : "Reopening…";

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = isActive ? await closeThesis(thesisId) : await reopenThesis(thesisId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
        {actionLabel}
      </Button>
      {confirming ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !isPending) {
              setError(null);
              setConfirming(false);
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {isActive ? "Close this thesis?" : "Reopen this thesis?"}
              </DialogTitle>
              <DialogDescription>
                {isActive
                  ? `Your ${ticker} thesis moves to Closed. You can reopen it any time.`
                  : `Your ${ticker} thesis moves back to Active.`}
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              <Button type="button" disabled={isPending} onClick={handleConfirm}>
                {isPending ? (
                  <>
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                    {pendingLabel}
                  </>
                ) : (
                  actionLabel
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

"use client";

// Confirm-delete for one transaction (§2.4): the description names the
// specific row being removed — never a generic "Are you sure?". While the
// delete request is in flight, both buttons are disabled and the dialog
// can't be dismissed.
import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { deleteTransaction } from "@/app/actions/transactions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney, formatQuantity, formatShortDate } from "@/lib/format";

import { transactionTypeLabel, type TransactionRowData } from "./types";

/** One plain-English sentence naming the specific transaction. */
function describeTransaction(row: TransactionRowData): string {
  const label = transactionTypeLabel(row.type);
  const date = formatShortDate(row.tradeDate);
  const money = formatMoney(row.amount, row.currency);
  if (
    (row.type === "BUY" || row.type === "SELL") &&
    row.quantity !== null &&
    row.ticker
  ) {
    return `${label} of ${formatQuantity(row.quantity)} ${row.ticker} on ${date} for ${money}.`;
  }
  if (row.type === "DIVIDEND" && row.ticker) {
    return `${label} from ${row.ticker} on ${date} for ${money}.`;
  }
  return `${label} of ${money} on ${date}.`;
}

export function DeleteTransactionDialog({
  target,
  onClose,
}: {
  target: TransactionRowData | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Keep the last row around while the dialog animates closed.
  const open = target !== null;

  async function handleDelete() {
    if (!target) return;
    setPending(true);
    setError(null);
    const result = await deleteTransaction(target.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Not dismissable mid-request.
        if (!next && !pending) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete transaction?</DialogTitle>
          <DialogDescription>
            {target ? `${describeTransaction(target)} This can't be undone.` : ""}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setError(null);
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={handleDelete}
          >
            {pending ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Deleting…
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

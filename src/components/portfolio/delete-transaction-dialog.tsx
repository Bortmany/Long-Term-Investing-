"use client";

// Delete Transaction confirm dialog — the shared confirm-delete pattern
// (UI spec §2.4), naming the exact transaction being removed rather than a
// generic "Are you sure?".
import * as React from "react";
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

/** One plain-English sentence naming the specific transaction being deleted. */
function describeTransaction(t: TransactionRowData): string {
  const dateLabel = formatShortDate(t.tradeDate);
  const instrument = t.ticker ?? "an untracked instrument";
  const amountLabel = formatMoney(t.amount, t.currency);

  switch (t.type) {
    case "BUY":
      return `Buy of ${formatQuantity(t.quantity ?? 0)} ${instrument} on ${dateLabel} for ${amountLabel}.`;
    case "SELL":
      return `Sell of ${formatQuantity(t.quantity ?? 0)} ${instrument} on ${dateLabel} for ${amountLabel}.`;
    case "DIVIDEND":
      return `Dividend from ${instrument} on ${dateLabel} of ${amountLabel}.`;
    case "DEPOSIT":
    case "WITHDRAWAL":
      return `${transactionTypeLabel(t.type)} on ${dateLabel} of ${amountLabel}.`;
    case "FEE":
      return `Fee${t.ticker ? ` on ${t.ticker}` : ""} on ${dateLabel} of ${amountLabel}.`;
  }
}

export function DeleteTransactionDialog({
  transaction,
  onClose,
}: {
  transaction: TransactionRowData;
  onClose: () => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [isDeleting, startDeleting] = React.useTransition();

  function handleDelete() {
    setError(null);
    startDeleting(async () => {
      const result = await deleteTransaction(transaction.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isDeleting) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete transaction?</DialogTitle>
          <DialogDescription>
            {describeTransaction(transaction)} This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isDeleting} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isDeleting} onClick={handleDelete}>
            {isDeleting ? (
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

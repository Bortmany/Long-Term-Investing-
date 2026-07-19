"use client";

// Delete-my-account confirm dialog — same confirm-delete shape as
// DeleteTransactionDialog (password + a "DELETE" type-to-confirm gate before
// the destructive button will even enable, since this one has no undo).
import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { deleteMyAccount } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CONFIRM_WORD = "DELETE";

export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirmText, setConfirmText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isDeleting, startDeleting] = React.useTransition();

  const canSubmit = password.length > 0 && confirmText === CONFIRM_WORD && !isDeleting;

  function handleDelete() {
    if (!canSubmit) return;
    setError(null);
    startDeleting(async () => {
      const result = await deleteMyAccount({ password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(result.data.redirectTo);
      router.refresh();
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
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This permanently deletes your account, portfolio, transactions,
            theses, alerts and AI analyses. There is no undo.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delete-account-password">Your password</Label>
            <Input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delete-account-confirm">
              Type {CONFIRM_WORD} to confirm
            </Label>
            <Input
              id="delete-account-confirm"
              type="text"
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={isDeleting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!canSubmit}
            onClick={handleDelete}
          >
            {isDeleting ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Deleting…
              </>
            ) : (
              "Delete my account"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

// Update Price dialog (§3.2.3) — the pricing path for instruments the manual
// provider serves (non-US markets, or US without an FMP key). Saving writes a
// new MANUAL PriceCache row via the existing updateManualPrice action, so the
// holding then honestly shows "Manual, as of {date}".
import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { updateManualPrice } from "@/app/actions/prices";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Currency } from "@prisma/client";

export type UpdatePriceTarget = {
  instrumentId: string;
  ticker: string;
  /** The instrument's own currency — manual prices are stored in it. */
  currency: Currency;
};

/** Today's date in the local timezone, shaped for <input type="date">. */
function todayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function UpdatePriceDialog({
  target,
  onClose,
}: {
  target: UpdatePriceTarget | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const open = target !== null;

  const [price, setPrice] = React.useState("");
  const [asOf, setAsOf] = React.useState(todayInputValue);
  const [priceError, setPriceError] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // Fresh form each time the dialog opens for a holding.
  React.useEffect(() => {
    if (!open) return;
    setPrice("");
    setAsOf(todayInputValue());
    setPriceError(null);
    setServerError(null);
  }, [open, target?.instrumentId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!target) return;

    const priceNumber = Number(price);
    if (price.trim() === "" || !Number.isFinite(priceNumber) || priceNumber <= 0) {
      setPriceError("Price must be greater than zero.");
      return;
    }
    setPriceError(null);
    setServerError(null);

    setPending(true);
    const result = await updateManualPrice({
      instrumentId: target.instrumentId,
      price: priceNumber,
      asOf: new Date(asOf),
    });
    setPending(false);

    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Price — {target?.ticker}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="up-price">Price</Label>
            <Input
              id="up-price"
              type="number"
              step="any"
              min="0"
              className="mt-1.5"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            {priceError ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {priceError}
              </p>
            ) : null}
          </div>
          <div>
            {/* Read-only: manual prices are always in the instrument's own currency. */}
            <p className="text-sm font-medium leading-none">Currency</p>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              {target?.currency}
            </p>
          </div>
          <div>
            <Label htmlFor="up-asof">As of</Label>
            <Input
              id="up-asof"
              type="date"
              className="mt-1.5"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </div>
          {serverError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {serverError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

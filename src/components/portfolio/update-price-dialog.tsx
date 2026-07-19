"use client";

// Update Price dialog (UI spec §3.2.3) — manual price entry for instruments
// that route to the manual provider (non-US market, or US without an
// FMP_API_KEY). Writes a new PriceCache row with source MANUAL, so the
// Holdings row shows an honest "Manual, as of {date}" badge next load.
import * as React from "react";
import { LoaderCircle } from "lucide-react";
import type { Currency } from "@prisma/client";

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
import type { HoldingRowData } from "./types";

/** Today's date in the local timezone as an <input type="date"> value. */
function todayLocalIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function UpdatePriceDialog({
  holding,
  instrumentCurrency,
  onClose,
}: {
  holding: HoldingRowData;
  instrumentCurrency: Currency;
  onClose: () => void;
}) {
  const [price, setPrice] = React.useState(
    holding.price.ok ? String(holding.price.value) : "",
  );
  const [asOf, setAsOf] = React.useState(todayLocalIso);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, startSaving] = React.useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!price.trim() || Number(price) <= 0) {
      setError("Enter a price greater than zero.");
      return;
    }
    startSaving(async () => {
      const result = await updateManualPrice({
        instrumentId: holding.instrumentId,
        price,
        asOf,
      });
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
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Price — {holding.ticker}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="price-value" className="mb-1.5">
              Price
            </Label>
            <Input
              id="price-value"
              type="number"
              step="any"
              min="0"
              autoFocus
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1.5">Currency</Label>
            {/* Kept simple, per spec: read-only, not editable. */}
            <p className="text-sm text-slate-600 dark:text-slate-400">{instrumentCurrency}</p>
          </div>
          <div>
            <Label htmlFor="price-as-of" className="mb-1.5">
              As of
            </Label>
            <Input
              id="price-as-of"
              type="date"
              value={asOf}
              onChange={(event) => setAsOf(event.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSaving} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
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

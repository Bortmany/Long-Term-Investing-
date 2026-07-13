"use client";

// "Track a Stock" dialog (ui-spec §4.1). Three fields only — Ticker
// (uppercased as typed), Market, Name — because this is the lightweight entry
// point that gets a brand-new ticker into the system. The server action
// (trackStock) creates the Instrument if new and adds a WatchlistItem for the
// signed-in user.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Market } from "@prisma/client";
import { LoaderCircle } from "lucide-react";

import { trackStock } from "@/app/actions/instruments";
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
import { Select } from "@/components/ui/select";

const MARKET_OPTIONS = Object.values(Market).map((m) => ({ value: m, label: m }));

export function TrackStockDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = React.useState(false);

  return (
    <Dialog
      open={open}
      // Never dismissable mid-save so the request outcome is always seen.
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        {open ? (
          <TrackStockForm
            pending={pending}
            setPending={setPending}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TrackStockForm({
  pending,
  setPending,
  onClose,
}: {
  pending: boolean;
  setPending: (pending: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [ticker, setTicker] = React.useState("");
  const [market, setMarket] = React.useState<Market>("US");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await trackStock({ ticker, name, market });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  const submitDisabled =
    pending || ticker.trim() === "" || name.trim() === "";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Track a Stock</DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <Label htmlFor="track-ticker">Ticker</Label>
          <Input
            id="track-ticker"
            className="mt-1.5 uppercase"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="track-market">Market</Label>
          <Select
            id="track-market"
            className="mt-1.5"
            value={market}
            onValueChange={(v) => setMarket(v as Market)}
            options={MARKET_OPTIONS}
          />
        </div>
        <div>
          <Label htmlFor="track-name">Name</Label>
          <Input
            id="track-name"
            className="mt-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitDisabled}>
            {pending ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Adding…
              </>
            ) : (
              "Add"
            )}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

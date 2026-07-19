"use client";

// "Track a Stock" dialog (ui-spec §4.1) — the entry point that gets a brand
// new ticker into the system at all. Creates an Instrument row (reusing the
// same createInstrument action the Add Transaction dialog uses) and then a
// WatchlistItem row for the signed-in user. Keeps the ui-spec's minimal
// 3-field form (Ticker, Market, Name) but reuses the established "Prefill
// from FMP" pattern from transaction-dialog.tsx for Name — an honest,
// discoverable affordance rather than a silent auto-fill.
import * as React from "react";
import { LoaderCircle, Plus } from "lucide-react";
import type { Currency, Market } from "@prisma/client";

import { addToWatchlist } from "@/app/actions/stocks";
import {
  createInstrument,
  prefillInstrumentProfile,
} from "@/app/actions/instruments";
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
import { Select, type SelectOption } from "@/components/ui/select";

function marketLabel(market: Market): string {
  switch (market) {
    case "US":
      return "US";
    case "MSX":
      return "MSX (Muscat)";
    case "TADAWUL":
      return "Tadawul (Saudi)";
    case "DFM":
      return "DFM (Dubai)";
    case "OTHER":
      return "Other";
  }
}

/** A sensible default currency per market — overridden by FMP prefill when it succeeds. */
function defaultCurrencyForMarket(market: Market): Currency {
  switch (market) {
    case "US":
      return "USD";
    case "MSX":
      return "OMR";
    case "TADAWUL":
      return "SAR";
    case "DFM":
      return "AED";
    case "OTHER":
      return "USD";
  }
}

export function TrackStockDialog({ markets }: { markets: Market[] }) {
  const [open, setOpen] = React.useState(false);
  const [ticker, setTicker] = React.useState("");
  const [market, setMarket] = React.useState<Market>(markets[0] ?? "US");
  const [name, setName] = React.useState("");
  const [currency, setCurrency] = React.useState<Currency>(
    defaultCurrencyForMarket(market),
  );
  const [sector, setSector] = React.useState<string | undefined>(undefined);
  const [country, setCountry] = React.useState<string | undefined>(undefined);

  const [prefillMessage, setPrefillMessage] = React.useState<string | null>(
    null,
  );
  const [prefillError, setPrefillError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isPrefilling, startPrefilling] = React.useTransition();
  const [isSaving, startSaving] = React.useTransition();

  function reset() {
    setTicker("");
    setMarket(markets[0] ?? "US");
    setName("");
    setCurrency(defaultCurrencyForMarket(markets[0] ?? "US"));
    setSector(undefined);
    setCountry(undefined);
    setPrefillMessage(null);
    setPrefillError(null);
    setError(null);
  }

  function handleMarketChange(value: string) {
    const nextMarket = value as Market;
    setMarket(nextMarket);
    setCurrency(defaultCurrencyForMarket(nextMarket));
  }

  function handlePrefill() {
    setPrefillError(null);
    setPrefillMessage(null);
    startPrefilling(async () => {
      const result = await prefillInstrumentProfile(ticker, market);
      if (!result.ok) {
        setPrefillError(
          result.message ??
            "Prefill unavailable for this ticker — fill the name in by hand.",
        );
        return;
      }
      setName(result.data.name);
      if (result.data.sector) setSector(result.data.sector);
      if (result.data.country) setCountry(result.data.country);
      if (result.data.currency) setCurrency(result.data.currency);
      setPrefillMessage(
        "Prefilled from FMP — check the details before saving.",
      );
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!ticker.trim() || !name.trim()) {
      setError("Enter a ticker and a name.");
      return;
    }
    startSaving(async () => {
      const created = await createInstrument({
        ticker: ticker.trim(),
        name: name.trim(),
        market,
        currency,
        type: "STOCK",
        sector,
        country,
      });
      if (!created.ok) {
        setError(created.error);
        return;
      }
      const watched = await addToWatchlist(created.data.id);
      if (!watched.ok) {
        setError(watched.error);
        return;
      }
      reset();
      setOpen(false);
    });
  }

  const marketOptions: SelectOption[] = markets.map((m) => ({
    value: m,
    label: marketLabel(m),
  }));
  const busy = isSaving;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          reset();
          setOpen(false);
        } else {
          setOpen(next);
        }
      }}
    >
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Track a Stock
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Track a Stock</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="track-ticker" className="mb-1.5">
                Ticker
              </Label>
              <Input
                id="track-ticker"
                autoFocus
                value={ticker}
                onChange={(event) =>
                  setTicker(event.target.value.toUpperCase())
                }
                placeholder="AAPL"
              />
            </div>
            <div>
              <Label htmlFor="track-market" className="mb-1.5">
                Market
              </Label>
              <Select
                id="track-market"
                value={market}
                onValueChange={handleMarketChange}
                options={marketOptions}
              />
            </div>
          </div>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrefill}
              disabled={isPrefilling || !ticker.trim()}
            >
              {isPrefilling ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Checking…
                </>
              ) : (
                "Prefill from FMP"
              )}
            </Button>
          </div>
          {/* Golden rule: prefill failure is stated honestly, never a made-up name. */}
          {prefillError ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {prefillError}
            </p>
          ) : null}
          {prefillMessage ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {prefillMessage}
            </p>
          ) : null}
          <div>
            <Label htmlFor="track-name" className="mb-1.5">
              Name
            </Label>
            <Input
              id="track-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Apple Inc."
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {isSaving ? (
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
      </DialogContent>
    </Dialog>
  );
}

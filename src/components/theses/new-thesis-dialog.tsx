"use client";

// "New Thesis" dialog (ui-spec §5.1) — Instrument Select populated from the
// instruments the user holds or watches (the same set /stocks populates),
// Statement Textarea. Same shape/conventions as TrackStockDialog.
import * as React from "react";
import { LoaderCircle, Plus } from "lucide-react";

import { createThesis } from "@/app/actions/theses";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type ThesisInstrumentOption = { id: string; ticker: string; name: string };

export function NewThesisDialog({
  instruments,
  defaultInstrumentId,
  size,
}: {
  instruments: ThesisInstrumentOption[];
  /**
   * Which instrument starts selected. Used by the stock research page, where
   * the owner is already looking at one stock and shouldn't have to pick it
   * again. Ignored if it isn't one of the offered instruments.
   */
  defaultInstrumentId?: string;
  /** Trigger button size — "sm" to sit beside the stock page's small buttons. */
  size?: "default" | "sm";
}) {
  const initialInstrumentId =
    instruments.find((instrument) => instrument.id === defaultInstrumentId)?.id ??
    instruments[0]?.id ??
    "";
  const [open, setOpen] = React.useState(false);
  const [instrumentId, setInstrumentId] = React.useState(initialInstrumentId);
  const [statement, setStatement] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, startSaving] = React.useTransition();

  function reset() {
    setInstrumentId(initialInstrumentId);
    setStatement("");
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!instrumentId) {
      setError("Add a holding or track a stock first.");
      return;
    }
    startSaving(async () => {
      const result = await createThesis({ instrumentId, statement });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      setOpen(false);
    });
  }

  const options: SelectOption[] = instruments.map((instrument) => ({
    value: instrument.id,
    label: `${instrument.ticker} — ${instrument.name}`,
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isSaving) {
          reset();
          setOpen(false);
        } else {
          setOpen(next);
        }
      }}
    >
      <Button type="button" size={size} onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        New Thesis
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Thesis</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="thesis-instrument" className="mb-1.5">
              Instrument
            </Label>
            {options.length > 0 ? (
              <Select
                id="thesis-instrument"
                value={instrumentId}
                onValueChange={setInstrumentId}
                options={options}
              />
            ) : (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Add a holding or track a stock first.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="thesis-statement" className="mb-1.5">
              Statement
            </Label>
            <Textarea
              id="thesis-statement"
              rows={5}
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              placeholder="Why do you believe in this position? What has to stay true?"
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || options.length === 0}>
              {isSaving ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Creating…
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

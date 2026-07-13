"use client";

// "New Thesis" dialog (ui-spec §5.1) — pick an instrument the user already
// holds or watches, write the "why I own this" statement, and create the
// thesis via the createThesis server action. Mirrors TrackStockDialog's
// shape (controlled Dialog, pending state, inline error, router.refresh()).
import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { InstrumentOption } from "./types";

export function NewThesisDialog({
  open,
  onOpenChange,
  instrumentOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instrumentOptions: InstrumentOption[];
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
      <DialogContent className="max-w-lg">
        {open ? (
          <NewThesisForm
            instrumentOptions={instrumentOptions}
            pending={pending}
            setPending={setPending}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NewThesisForm({
  instrumentOptions,
  pending,
  setPending,
  onClose,
}: {
  instrumentOptions: InstrumentOption[];
  pending: boolean;
  setPending: (pending: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [instrumentId, setInstrumentId] = React.useState("");
  const [statement, setStatement] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const hasOptions = instrumentOptions.length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await createThesis({ instrumentId, statement });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  const submitDisabled =
    pending || !hasOptions || instrumentId === "" || statement.trim().length < 10;

  return (
    <>
      <DialogHeader>
        <DialogTitle>New Thesis</DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <Label htmlFor="thesis-instrument">Instrument</Label>
          {hasOptions ? (
            <Select
              id="thesis-instrument"
              className="mt-1.5"
              value={instrumentId}
              onValueChange={setInstrumentId}
              placeholder="Select an instrument"
              options={instrumentOptions.map((option) => ({
                value: option.id,
                label: `${option.ticker} — ${option.name}`,
              }))}
            />
          ) : (
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Add a holding or track a stock first,
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="thesis-statement">Statement</Label>
          <Textarea
            id="thesis-statement"
            className="mt-1.5"
            rows={5}
            placeholder="Why do you believe in this position? What has to stay true?"
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            disabled={!hasOptions}
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
                Creating…
              </>
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

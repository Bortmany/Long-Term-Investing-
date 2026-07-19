"use client";

// New/Edit Alert dialog (ui-spec-style, BUILD-PLAN.md Phase 7). One dialog
// handles both New (editing = null) and Edit (editing = the row). The kind
// Select swaps which target picker (instrument vs. thesis) and which value
// field (threshold vs. interval days) show, same "genuinely dynamic form"
// pattern as portfolio/transaction-dialog.tsx.
import * as React from "react";
import { LoaderCircle } from "lucide-react";
import type { AlertKind } from "@prisma/client";

import { createAlert, updateAlert } from "@/app/actions/alerts";
import { alertKindLabel, type AlertInput } from "@/lib/alert-schema";
import { Button } from "@/components/ui/button";
import { ExplainerTip } from "@/components/explainer-tip";
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
import type { AlertInstrumentOption, AlertRowData, AlertThesisOption } from "./types";

const KIND_OPTIONS: AlertKind[] = ["PRICE_ABOVE", "PRICE_BELOW", "DAY_DROP", "THESIS_REVIEW_DUE"];

/** Type guard so buildPayload can build the right AlertInput branch without an unsafe cast. */
function isPriceKind(kind: AlertKind): kind is "PRICE_ABOVE" | "PRICE_BELOW" | "DAY_DROP" {
  return kind !== "THESIS_REVIEW_DUE";
}

export function AlertDialog({
  editing,
  instrumentOptions,
  thesisOptions,
  onClose,
}: {
  editing: AlertRowData | null;
  instrumentOptions: AlertInstrumentOption[];
  thesisOptions: AlertThesisOption[];
  onClose: () => void;
}) {
  const [kind, setKind] = React.useState<AlertKind>(editing?.kind ?? "PRICE_ABOVE");
  const [instrumentId, setInstrumentId] = React.useState(
    editing?.instrumentId ?? instrumentOptions[0]?.id ?? "",
  );
  const [thesisId, setThesisId] = React.useState(editing?.thesisId ?? thesisOptions[0]?.id ?? "");
  const [threshold, setThreshold] = React.useState(
    editing?.threshold != null ? String(editing.threshold) : "",
  );
  const [intervalDays, setIntervalDays] = React.useState(
    editing?.intervalDays != null ? String(editing.intervalDays) : "90",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, startSaving] = React.useTransition();

  const isThesisKind = kind === "THESIS_REVIEW_DUE";
  const selectedInstrument = instrumentOptions.find((i) => i.id === instrumentId);

  function buildPayload(): AlertInput {
    if (isPriceKind(kind)) {
      return { kind, instrumentId, threshold: Number(threshold) };
    }
    return { kind: "THESIS_REVIEW_DUE", thesisId, intervalDays: Number(intervalDays) };
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (isThesisKind && !thesisId) {
      setError("Write a thesis first.");
      return;
    }
    if (!isThesisKind && !instrumentId) {
      setError("Add a holding or track a stock first.");
      return;
    }

    const payload = buildPayload();
    startSaving(async () => {
      const result = editing ? await updateAlert(editing.id, payload) : await createAlert(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  const kindSelectOptions: SelectOption[] = KIND_OPTIONS.map((k) => ({
    value: k,
    label: alertKindLabel(k),
  }));
  const instrumentSelectOptions: SelectOption[] = instrumentOptions.map((i) => ({
    value: i.id,
    label: `${i.ticker} — ${i.name}`,
  }));
  const thesisSelectOptions: SelectOption[] = thesisOptions.map((t) => ({
    value: t.id,
    label: t.ticker,
  }));

  const noTargets = isThesisKind ? thesisOptions.length === 0 : instrumentOptions.length === 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Alert" : "New Alert"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="alert-kind" className="mb-1.5">
              Alert type
            </Label>
            <Select
              id="alert-kind"
              value={kind}
              onValueChange={(value) => setKind(value as AlertKind)}
              options={kindSelectOptions}
            />
          </div>

          {isThesisKind ? (
            <div>
              <Label htmlFor="alert-thesis" className="mb-1.5">
                Thesis
              </Label>
              {thesisSelectOptions.length > 0 ? (
                <Select
                  id="alert-thesis"
                  value={thesisId}
                  onValueChange={setThesisId}
                  options={thesisSelectOptions}
                />
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-400">Write a thesis first.</p>
              )}
            </div>
          ) : (
            <div>
              <Label htmlFor="alert-instrument" className="mb-1.5">
                Stock
              </Label>
              {instrumentSelectOptions.length > 0 ? (
                <Select
                  id="alert-instrument"
                  value={instrumentId}
                  onValueChange={setInstrumentId}
                  options={instrumentSelectOptions}
                />
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Add a holding or track a stock first.
                </p>
              )}
            </div>
          )}

          {isThesisKind ? (
            <div>
              {/* ExplainerTip sits OUTSIDE the <label> (not nested inside
                  it) so it never changes the label's accessible name that
                  getByLabel() in the e2e tests matches on. */}
              <div className="mb-1.5 inline-flex items-center gap-1">
                <Label htmlFor="alert-interval">Review every (days)</Label>
                <ExplainerTip term="thesis-review" />
              </div>
              <Input
                id="alert-interval"
                type="number"
                min="1"
                max="365"
                step="1"
                value={intervalDays}
                onChange={(event) => setIntervalDays(event.target.value)}
              />
            </div>
          ) : (
            <div>
              <div className="mb-1.5 inline-flex items-center gap-1">
                <Label htmlFor="alert-threshold">
                  {kind === "DAY_DROP" ? "Drop percent" : `Price (${selectedInstrument?.currency ?? ""})`}
                </Label>
                <ExplainerTip term={kind === "DAY_DROP" ? "day-drop-alert" : "price-alert"} />
              </div>
              <Input
                id="alert-threshold"
                type="number"
                step="any"
                min="0"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
                placeholder={kind === "DAY_DROP" ? "e.g. 5" : "e.g. 0.400"}
              />
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Alerts are checked while you use the app (and hourly if the schedule is turned on).
            They only fire on live or manually entered prices — never on sample data.
          </p>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSaving} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || noTargets}>
              {isSaving ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : editing ? (
                "Save Changes"
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

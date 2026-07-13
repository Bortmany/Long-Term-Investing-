"use client";

// The "Buy Analysis Assumptions" dialog (ui-spec §6, item 4). A small
// controlled form — pending/error state is centralized in
// CommitteeWorkspace, which owns `onSubmit`; this component only collects
// the four optional fields and hands them up.
import * as React from "react";
import { LoaderCircle } from "lucide-react";

import type { BuyAnalysisAssumptions } from "@/app/actions/committee";
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
import { Select } from "@/components/ui/select";

const HORIZON_OPTIONS = [
  { value: "Short (<1yr)", label: "Short (<1yr)" },
  { value: "Medium (1-3yr)", label: "Medium (1-3yr)" },
  { value: "Long (3yr+)", label: "Long (3yr+)" },
];

const RISK_OPTIONS = [
  { value: "Conservative", label: "Conservative" },
  { value: "Moderate", label: "Moderate" },
  { value: "Aggressive", label: "Aggressive" },
];

export function BuyAnalysisDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (assumptions: BuyAnalysisAssumptions) => Promise<void>;
  isPending: boolean;
}) {
  const [intendedPrice, setIntendedPrice] = React.useState("");
  const [horizon, setHorizon] = React.useState("");
  const [riskTolerance, setRiskTolerance] = React.useState("");
  const [philosophy, setPhilosophy] = React.useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedPrice = intendedPrice.trim();
    const parsedPrice = trimmedPrice ? Number(trimmedPrice) : null;
    void onSubmit({
      intendedPrice:
        parsedPrice !== null && !Number.isNaN(parsedPrice) ? parsedPrice : null,
      horizon: horizon || null,
      riskTolerance: riskTolerance || null,
      philosophy: philosophy.trim() ? philosophy.trim() : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buy Analysis Assumptions</DialogTitle>
          <DialogDescription>
            All optional — leave a field blank to let the committee use its own judgment.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="buy-intended-price" className="text-sm font-medium">
              Intended Price
            </label>
            <Input
              id="buy-intended-price"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              placeholder="e.g. 145.00"
              value={intendedPrice}
              onChange={(event) => setIntendedPrice(event.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="buy-horizon" className="text-sm font-medium">
              Horizon
            </label>
            <Select
              id="buy-horizon"
              value={horizon}
              onValueChange={setHorizon}
              options={HORIZON_OPTIONS}
              placeholder="Select a horizon"
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="buy-risk-tolerance" className="text-sm font-medium">
              Risk Tolerance
            </label>
            <Select
              id="buy-risk-tolerance"
              value={riskTolerance}
              onValueChange={setRiskTolerance}
              options={RISK_OPTIONS}
              placeholder="Select a risk tolerance"
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="buy-philosophy" className="text-sm font-medium">
              Philosophy
            </label>
            <Input
              id="buy-philosophy"
              placeholder="value, growth, income…"
              value={philosophy}
              onChange={(event) => setPhilosophy(event.target.value)}
              disabled={isPending}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              {isPending ? "Analyzing…" : "Run Buy Analysis"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

// Settings — FX Rates card: the stored rates table (with per-row source
// badges and delete), an inline "Add FX Rate" row (always source MANUAL),
// and the "Refresh from FMP" button. When FMP_API_KEY is not configured the
// server passes hasFmpKey=false and the refresh button is disabled (but kept
// focusable) with a tooltip explaining why — the key itself never reaches
// the client, only this boolean.

import * as React from "react";
import { Currency, type PriceSource } from "@prisma/client";
import { LoaderCircle, RefreshCw, Trash2 } from "lucide-react";

import {
  addFxRate,
  deleteFxRate,
  refreshFxRates,
  type FxRefreshReport,
} from "@/app/actions/settings";
import { SourceBadge, type SourceBadgeProps } from "@/components/source-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatShortDate } from "@/lib/format";

/** One stored FX rate, already converted to plain data by the server page. */
export type FxRateRowData = {
  id: string;
  base: Currency;
  quote: Currency;
  rate: number;
  asOf: Date;
  source: PriceSource;
};

const CURRENCY_OPTIONS = Object.values(Currency).map((currency) => ({
  value: currency,
  label: currency,
}));

/** An FX rate is a ratio, not money — show it plainly, up to 6 decimals. */
const rateFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });

/** Honest badge per stored source: FMP is live, MANUAL dated, SEED sample. */
function badgeForFxSource(
  source: PriceSource,
  asOf: Date,
): Pick<SourceBadgeProps, "variant" | "date"> {
  if (source === "FMP") return { variant: "live" };
  if (source === "MANUAL") return { variant: "manual", date: formatShortDate(asOf) };
  return { variant: "sample" };
}

/** Today as a yyyy-mm-dd string in the owner's local time zone. */
function todayIsoDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function FxRatesCard({
  rates,
  hasFmpKey,
}: {
  rates: FxRateRowData[];
  hasFmpKey: boolean;
}) {
  const [error, setError] = React.useState<string | null>(null);

  // --- Refresh from FMP ---
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshReport, setRefreshReport] = React.useState<FxRefreshReport | null>(
    null,
  );

  async function handleRefresh() {
    setError(null);
    setRefreshReport(null);
    setRefreshing(true);
    try {
      const result = await refreshFxRates();
      if (result.ok) {
        setRefreshReport(result.data);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong refreshing the FX rates. Please try again.");
    } finally {
      setRefreshing(false);
    }
  }

  // --- Inline Add FX Rate row ---
  const [addBase, setAddBase] = React.useState("");
  const [addQuote, setAddQuote] = React.useState("");
  const [addRate, setAddRate] = React.useState("");
  const [addAsOf, setAddAsOf] = React.useState(todayIsoDate);
  const [adding, setAdding] = React.useState(false);

  async function handleAdd() {
    setError(null);
    setAdding(true);
    try {
      const result = await addFxRate({
        base: addBase as Currency,
        quote: addQuote as Currency,
        rate: addRate,
        asOf: addAsOf,
      });
      if (result.ok) {
        // The table re-renders with the new row (the action revalidates the
        // page); clear the rate so a second add starts fresh.
        setAddRate("");
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong adding that FX rate. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  // --- Confirm delete (the shared confirm-delete pattern) ---
  const [toDelete, setToDelete] = React.useState<FxRateRowData | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    if (!toDelete) return;
    setError(null);
    setDeleting(true);
    try {
      const result = await deleteFxRate(toDelete.id);
      if (!result.ok) {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong deleting that FX rate. Please try again.");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  const refreshButton = (
    <Button
      variant="outline"
      onClick={hasFmpKey && !refreshing ? handleRefresh : undefined}
      aria-disabled={!hasFmpKey || refreshing}
      className={!hasFmpKey ? "cursor-not-allowed opacity-50" : undefined}
    >
      {refreshing ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw aria-hidden="true" />
      )}
      {refreshing ? "Refreshing…" : "Refresh from FMP"}
    </Button>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>FX Rates</CardTitle>
        {hasFmpKey ? (
          refreshButton
        ) : (
          // Disabled but still focusable, so keyboard users get the tooltip
          // too (a truly disabled button would be skipped entirely).
          <Tooltip>
            <TooltipTrigger tabIndex={-1}>{refreshButton}</TooltipTrigger>
            <TooltipContent>
              Add an FMP_API_KEY to your environment to fetch live FX rates.
            </TooltipContent>
          </Tooltip>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {refreshReport ? <RefreshSummary report={refreshReport} /> : null}

        {rates.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No FX rates stored yet. Add one below, or refresh from FMP.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Base</TableHead>
                <TableHead>Quote</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead>As of</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((rate) => (
                <TableRow key={rate.id}>
                  <TableCell className="font-mono">{rate.base}</TableCell>
                  <TableCell className="font-mono">{rate.quote}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {rateFormat.format(rate.rate)}
                  </TableCell>
                  <TableCell>{formatShortDate(rate.asOf)}</TableCell>
                  <TableCell>
                    <SourceBadge {...badgeForFxSource(rate.source, rate.asOf)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label={`Delete the ${rate.base}→${rate.quote} rate as of ${formatShortDate(rate.asOf)}`}
                      onClick={() => setToDelete(rate)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Inline Add FX Rate row — entries here are always source MANUAL. */}
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <div className="space-y-1">
            <Label htmlFor="fx-add-base" className="text-xs">
              Base
            </Label>
            <Select
              id="fx-add-base"
              value={addBase}
              onValueChange={setAddBase}
              options={CURRENCY_OPTIONS}
              placeholder="Base"
              className="w-28"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fx-add-quote" className="text-xs">
              Quote
            </Label>
            <Select
              id="fx-add-quote"
              value={addQuote}
              onValueChange={setAddQuote}
              options={CURRENCY_OPTIONS}
              placeholder="Quote"
              className="w-28"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fx-add-rate" className="text-xs">
              Rate
            </Label>
            <Input
              id="fx-add-rate"
              type="number"
              min="0"
              step="any"
              value={addRate}
              onChange={(event) => setAddRate(event.target.value)}
              className="w-32"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fx-add-asof" className="text-xs">
              As of
            </Label>
            <Input
              id="fx-add-asof"
              type="date"
              value={addAsOf}
              onChange={(event) => setAddAsOf(event.target.value)}
              className="w-40"
            />
          </div>
          <Button
            onClick={handleAdd}
            disabled={adding || !addBase || !addQuote || !addRate || !addAsOf}
          >
            {adding ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Adding…
              </>
            ) : (
              "Add"
            )}
          </Button>
        </div>
      </CardContent>

      {/* Confirm delete — the shared pattern: name the specific thing. */}
      <Dialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setToDelete(null);
        }}
      >
        {toDelete ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete FX rate?</DialogTitle>
              <DialogDescription>
                This removes the {toDelete.base}→{toDelete.quote} rate of{" "}
                {rateFormat.format(toDelete.rate)} as of{" "}
                {formatShortDate(toDelete.asOf)}. This can&apos;t be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setToDelete(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? (
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
        ) : null}
      </Dialog>
    </Card>
  );
}

/**
 * What the FMP refresh actually did — golden rule: pairs that could not be
 * refreshed are listed with their reason, never silently dropped.
 */
function RefreshSummary({ report }: { report: FxRefreshReport }) {
  return (
    <div className="space-y-1 text-sm">
      {report.updated.length > 0 ? (
        <p className="text-slate-600 dark:text-slate-400">
          Updated{" "}
          {report.updated
            .map((pair) => `${pair.base}→${pair.quote}`)
            .join(", ")}
          .
        </p>
      ) : null}
      {report.unavailable.map((pair) => (
        <p
          key={`${pair.base}-${pair.quote}`}
          className="text-amber-700 dark:text-amber-400"
        >
          {pair.base}→{pair.quote} unavailable —{" "}
          {pair.message ?? "no live rate could be fetched."}
        </p>
      ))}
      {report.updated.length === 0 && report.unavailable.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-400">
          Nothing to refresh — every other currency already has a fresh rate.
        </p>
      ) : null}
    </div>
  );
}

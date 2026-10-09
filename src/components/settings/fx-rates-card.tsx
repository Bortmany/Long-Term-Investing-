"use client";

// FX Rates card (UI spec §3.4): the stored rates table with source badges,
// an inline add-rate form (always saved as MANUAL), per-row delete with the
// standard confirm dialog, and a "Refresh from FMP" button that is honestly
// disabled — with an explanation — when no FMP_API_KEY is configured. The
// page only ever tells this component WHETHER a key exists (a boolean); the
// key value itself never reaches the browser.

import * as React from "react";
import { LoaderCircle, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import type { Currency } from "@prisma/client";

import {
  addFxRate,
  deleteFxRate,
  refreshFxRates,
  type FxRefreshReport,
} from "@/app/actions/settings";
import { SourceBadge, type SourceBadgeProps } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExplainerTip } from "@/components/explainer-tip";
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
import { ResponsiveRows } from "@/components/ui/responsive-rows";
import { RowCard } from "@/components/ui/row-card";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** One stored FX rate, already converted/formatted server-side for display. */
export type FxRateDisplayRow = {
  id: string;
  base: Currency;
  quote: Currency;
  rate: number;
  /** The as-of date (used to find the newest usable rate). */
  asOf: Date;
  /** Pre-formatted as-of date, e.g. "Jul 10, 2026". */
  asOfLabel: string;
  /** Source badge props computed server-side from the row's PriceSource. */
  badge: Pick<SourceBadgeProps, "variant" | "date">;
  /**
   * Whether this row can be deleted here — true only for the signed-in user's
   * OWN manual rates. The shared FMP / seed rates are read-only from Settings.
   */
  deletable: boolean;
};

/**
 * FX rates are plain numbers, not money amounts, so formatMoney doesn't
 * apply — show up to 6 decimals (enough for e.g. 1 USD = 0.385 OMR).
 */
function formatRate(rate: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(rate);
}

/** The amber sentence shown when a held/tracked currency has no rate. */
export function missingRateSentence(code: string): string {
  return `No rate found for ${code}. Type one in below.`;
}

/** Today's date in the local timezone as an <input type="date"> value. */
function todayLocalIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function FxRatesCard({
  rates,
  currencies,
  baseCurrency,
  hasFmpKey,
  missingRateCurrencies = [],
}: {
  rates: FxRateDisplayRow[];
  /** The Currency enum values, passed from the server so the list can't drift from the schema. */
  currencies: Currency[];
  baseCurrency: Currency;
  hasFmpKey: boolean;
  /** Held or tracked currencies with no usable rate into the base currency. */
  missingRateCurrencies?: Currency[];
}) {
  // --- Add-rate form (entries here are always source MANUAL) ---
  const firstNonBase =
    currencies.find((c) => c !== baseCurrency) ?? baseCurrency;
  const [newBase, setNewBase] = React.useState<string>(firstNonBase);
  const [newQuote, setNewQuote] = React.useState<string>(baseCurrency);
  const [newRate, setNewRate] = React.useState("");
  const [newAsOf, setNewAsOf] = React.useState(todayLocalIso);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [isAdding, startAdding] = React.useTransition();

  // --- Delete confirm dialog ---
  const [deleting, setDeleting] = React.useState<FxRateDisplayRow | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isDeleting, startDeleting] = React.useTransition();

  // --- Refresh from FMP ---
  const [report, setReport] = React.useState<FxRefreshReport | null>(null);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);
  const [isRefreshing, startRefreshing] = React.useTransition();

  function handleAdd() {
    setAddError(null);
    startAdding(async () => {
      const result = await addFxRate({
        base: newBase as Currency,
        quote: newQuote as Currency,
        rate: newRate,
        asOf: newAsOf,
      });
      if (!result.ok) {
        setAddError(result.error);
        return;
      }
      // Keep the pair and date; clear the rate for the next entry.
      setNewRate("");
    });
  }

  function handleDelete() {
    if (!deleting) return;
    setDeleteError(null);
    startDeleting(async () => {
      const result = await deleteFxRate(deleting.id);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      setDeleting(null);
    });
  }

  function handleRefresh() {
    setReport(null);
    setRefreshError(null);
    startRefreshing(async () => {
      const result = await refreshFxRates();
      if (!result.ok) {
        setRefreshError(result.error);
        return;
      }
      setReport(result.data);
    });
  }

  const refreshButtonBody = (
    <>
      {isRefreshing ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw aria-hidden="true" />
      )}
      {isRefreshing ? "Refreshing…" : "Refresh from FMP"}
    </>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="inline-flex items-center gap-1">
          FX Rates <ExplainerTip term="fx-rate" />
        </CardTitle>
        {hasFmpKey ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-11 md:h-10"
          >
            {refreshButtonBody}
          </Button>
        ) : (
          // No key: the button stays visible AND focusable (aria-disabled,
          // not the disabled attribute) so the tooltip can explain why.
          <Tooltip>
            <TooltipTrigger>
              <Button
                type="button"
                variant="outline"
                aria-disabled="true"
                className="h-11 cursor-not-allowed opacity-50 hover:bg-background hover:text-foreground md:h-10"
                onClick={(event) => event.preventDefault()}
              >
                {refreshButtonBody}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {process.env.NODE_ENV !== "production"
                ? "Add an FMP_API_KEY to your environment to fetch live FX rates."
                : "Live exchange rates aren't switched on yet."}
            </TooltipContent>
          </Tooltip>
        )}
      </CardHeader>
      <CardContent>
        {refreshError ? (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400">
            {refreshError}
          </p>
        ) : null}
        {missingRateCurrencies.map((code) => (
          <p
            key={`missing-${code}`}
            className="mb-3 flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400"
          >
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{missingRateSentence(code)}</span>
          </p>
        ))}
        {report ? (
          // Honest refresh report: exactly which pairs updated, and which
          // stayed unavailable (those never get made-up rates).
          <div className="mb-3 space-y-1 text-sm">
            <p className="text-slate-600 dark:text-slate-400">
              {report.updated.length === 0
                ? "No rates were updated."
                : `Updated ${report.updated.length} rate${report.updated.length === 1 ? "" : "s"}: ${report.updated
                    .map((u) => `${u.base}→${u.quote}`)
                    .join(", ")}.`}
            </p>
            {report.unavailable.map((pair) => (
              <p
                key={`${pair.base}-${pair.quote}`}
                className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400"
              >
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  {pair.base}→{pair.quote} couldn&apos;t be refreshed
                  {pair.message ? ` — ${pair.message}` : "."}
                </span>
              </p>
            ))}
          </div>
        ) : null}

        {rates.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
            No FX rates stored yet — add one below.
          </p>
        ) : (
          <ResponsiveRows
            listLabel="FX rates"
            table={
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Base</TableHead>
                    <TableHead>Quote</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>As of</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono font-medium">
                        {row.base}
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {row.quote}
                      </TableCell>
                      <TableCell
                        className="text-right tabular-nums"
                        data-figure
                      >
                        {formatRate(row.rate)}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {row.asOfLabel}
                      </TableCell>
                      <TableCell>
                        <SourceBadge {...row.badge} />
                      </TableCell>
                      <TableCell>
                        {row.deletable ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-9"
                                aria-label={`Delete the ${row.base} to ${row.quote} rate as of ${row.asOfLabel}`}
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleting(row);
                                }}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left">{`Delete the ${row.base} to ${row.quote} rate`}</TooltipContent>
                          </Tooltip>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            }
            cards={rates.map((row) => (
              <RowCard
                key={row.id}
                density="compact"
                identity={
                  <span className="font-mono font-semibold">
                    {row.base} → {row.quote}
                  </span>
                }
                headline={
                  <span className="text-base tabular-nums" data-figure>
                    {formatRate(row.rate)}
                  </span>
                }
                meta={
                  <>
                    As of {row.asOfLabel} <SourceBadge {...row.badge} />
                  </>
                }
                action={
                  row.deletable ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label={`Delete the ${row.base} to ${row.quote} rate as of ${row.asOfLabel}`}
                      onClick={() => {
                        setDeleteError(null);
                        setDeleting(row);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  ) : undefined
                }
              />
            ))}
          />
        )}

        {/* Inline add-rate row — always stored as a MANUAL rate. */}
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <h3 className="mb-3 text-sm font-semibold">Add FX Rate</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-24">
              <Label htmlFor="fx-base" className="mb-1.5">
                Base
              </Label>
              <Select
                id="fx-base"
                value={newBase}
                onValueChange={setNewBase}
                className="[&_select]:h-11 md:[&_select]:h-10"
                options={currencies.map((c) => ({ value: c, label: c }))}
              />
            </div>
            <div className="w-24">
              <Label htmlFor="fx-quote" className="mb-1.5">
                Quote
              </Label>
              <Select
                id="fx-quote"
                value={newQuote}
                onValueChange={setNewQuote}
                className="[&_select]:h-11 md:[&_select]:h-10"
                options={currencies.map((c) => ({ value: c, label: c }))}
              />
            </div>
            <div className="w-32">
              <Label htmlFor="fx-rate" className="mb-1.5">
                Rate
              </Label>
              <Input
                id="fx-rate"
                type="number"
                step="any"
                min="0"
                value={newRate}
                onChange={(event) => setNewRate(event.target.value)}
                placeholder="0.385"
                className="h-11 md:h-10"
              />
            </div>
            <div className="w-40">
              <Label htmlFor="fx-asof" className="mb-1.5">
                As of
              </Label>
              <Input
                id="fx-asof"
                type="date"
                value={newAsOf}
                onChange={(event) => setNewAsOf(event.target.value)}
                className="h-11 md:h-10"
              />
            </div>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={isAdding || newRate.trim() === ""}
              className="h-11 md:h-10"
            >
              {isAdding ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Adding…
                </>
              ) : (
                "Add"
              )}
            </Button>
          </div>
          {addError ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {addError}
            </p>
          ) : null}
        </div>
      </CardContent>

      {/* Confirm-delete dialog (UI spec §2.4) — names the exact rate. */}
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleting(null);
        }}
      >
        {deleting ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete FX rate?</DialogTitle>
              <DialogDescription>
                This removes the {deleting.base}→{deleting.quote} rate of{" "}
                {formatRate(deleting.rate)} as of {deleting.asOfLabel}.
              </DialogDescription>
            </DialogHeader>
            {deleteError ? (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                {deleteError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isDeleting}
                onClick={() => setDeleting(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isDeleting}
                onClick={handleDelete}
              >
                {isDeleting ? (
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

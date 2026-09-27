"use client";

// Transactions card (UI spec §3.2): a filterable, sortable-by-newest table
// with client-side "Load more" paging (25 rows at a time — a personal
// portfolio never needs a real pagination primitive) and per-row Edit/Delete.
// Amount is a cash-flow direction (+/− sign), never colored — per §2.6 that
// color is reserved for genuine gain/loss figures, not inflow/outflow.
import * as React from "react";
import { EllipsisVertical } from "lucide-react";
import type { TransactionType } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { formatQuantity, formatShortDate } from "@/lib/format";
import { isCashInflow, transactionTypeLabel, type TransactionRowData } from "./types";

const PAGE_SIZE = 25;
const ALL = "ALL";

/** Money amounts here sit next to their own Currency column, so this shows
    just the number (decimals matching formatMoney's OMR-3dp rule) without
    repeating the currency code a second time. */
function decimalsFor(currency: string): number {
  return currency === "OMR" ? 3 : 2;
}

function formatPlainAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimalsFor(currency),
    maximumFractionDigits: decimalsFor(currency),
  }).format(amount);
}

export function TransactionsTable({
  rows,
  transactionTypes,
  onAdd,
  onEdit,
  onDelete,
}: {
  rows: TransactionRowData[];
  /** The TransactionType enum values, passed from the server so the filter can't drift from the schema. */
  transactionTypes: TransactionType[];
  onAdd: () => void;
  onEdit: (row: TransactionRowData) => void;
  onDelete: (row: TransactionRowData) => void;
}) {
  const [typeFilter, setTypeFilter] = React.useState<string>(ALL);
  const [instrumentFilter, setInstrumentFilter] = React.useState<string>(ALL);
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

  const instrumentOptions = React.useMemo(() => {
    const tickers = new Set<string>();
    for (const row of rows) {
      if (row.ticker) tickers.add(row.ticker);
    }
    return Array.from(tickers).sort();
  }, [rows]);

  const filtered = rows.filter((row) => {
    if (typeFilter !== ALL && row.type !== typeFilter) return false;
    if (instrumentFilter !== ALL && row.ticker !== instrumentFilter) return false;
    return true;
  });
  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visible.length;

  function handleTypeFilterChange(value: string) {
    setTypeFilter(value);
    setVisibleCount(PAGE_SIZE);
  }

  function handleInstrumentFilterChange(value: string) {
    setInstrumentFilter(value);
    setVisibleCount(PAGE_SIZE);
  }

  function clearFilters() {
    setTypeFilter(ALL);
    setInstrumentFilter(ALL);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <Card className="mt-6 gap-4">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Transactions</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={typeFilter}
            onValueChange={handleTypeFilterChange}
            options={[
              { value: ALL, label: "All types" },
              ...transactionTypes.map((t) => ({ value: t, label: transactionTypeLabel(t) })),
            ]}
            className="w-36"
            aria-label="Filter by transaction type"
          />
          <Select
            value={instrumentFilter}
            onValueChange={handleInstrumentFilterChange}
            options={[
              { value: ALL, label: "All instruments" },
              ...instrumentOptions.map((ticker) => ({ value: ticker, label: ticker })),
            ]}
            className="w-40"
            aria-label="Filter by instrument"
          />
          <Button type="button" variant="ghost" onClick={onAdd}>
            + Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length > 0 && filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            <p>No transactions match these filters.</p>
            <Button type="button" variant="link" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Instrument</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatShortDate(row.tradeDate)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{transactionTypeLabel(row.type)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">{row.ticker ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantity === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        formatQuantity(row.quantity)
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.pricePerUnit === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        formatPlainAmount(row.pricePerUnit, row.currency)
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* Cash-flow direction, not a return figure — plain slate, never green/red (§2.6). */}
                      {isCashInflow(row.type) ? "+" : "−"}
                      {formatPlainAmount(row.amount, row.currency)}
                    </TableCell>
                    <TableCell>{row.currency}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPlainAmount(row.fee, row.currency)}
                    </TableCell>
                    <TableCell className="max-w-40">
                      {row.note ? (
                        <Tooltip>
                          <TooltipTrigger className="block truncate">{row.note}</TooltipTrigger>
                          <TooltipContent>{row.note}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-9"
                            aria-label={`Actions for the ${transactionTypeLabel(row.type).toLowerCase()} on ${formatShortDate(row.tradeDate)}`}
                          >
                            <EllipsisVertical aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => onEdit(row)}>Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => onDelete(row)}>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {hasMore ? (
              <div className="mt-4 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                >
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

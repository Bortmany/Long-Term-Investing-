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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatQuantity, formatQuantityCompact, formatShortDate } from "@/lib/format";
import { FromBrokerTag, FromBrokerTagToggle } from "./from-broker-tag";
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

/** The Edit/Delete menu, shared by the table row and the phone card. */
function TransactionActions({
  row,
  onEdit,
  onDelete,
  buttonClassName = "size-9",
}: {
  row: TransactionRowData;
  onEdit: (row: TransactionRowData) => void;
  onDelete: (row: TransactionRowData) => void;
  buttonClassName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Tooltip>
          <TooltipTrigger>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={buttonClassName}
              aria-label={`Actions for the ${transactionTypeLabel(row.type).toLowerCase()} on ${formatShortDate(row.tradeDate)}`}
            >
              <EllipsisVertical aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Actions</TooltipContent>
        </Tooltip>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => onEdit(row)}>Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onDelete(row)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One transaction as a compact card (shown below 1280px). The card goes
 * nowhere, so it has no link and no chevron; only its menu button is active.
 */
function TransactionCard({
  row,
  brokerConnected,
  onEdit,
  onDelete,
}: {
  row: TransactionRowData;
  brokerConnected: boolean;
  onEdit: (row: TransactionRowData) => void;
  onDelete: (row: TransactionRowData) => void;
}) {
  const details = [
    { label: "Date", value: formatShortDate(row.tradeDate) },
    {
      label: "Quantity",
      value:
        row.quantity === null ? (
          <span className="text-slate-400">—</span>
        ) : (
          <span className="tabular-nums" aria-label={`${formatQuantity(row.quantity)} shares`}>
            {formatQuantityCompact(row.quantity)}
          </span>
        ),
      title: row.quantity === null ? undefined : `${formatQuantity(row.quantity)} shares`,
    },
    {
      label: `Price (${row.currency})`,
      value:
        row.pricePerUnit === null ? (
          <span className="text-slate-400">—</span>
        ) : (
          <span className="tabular-nums">{formatPlainAmount(row.pricePerUnit, row.currency)}</span>
        ),
    },
    {
      label: `Fee (${row.currency})`,
      value: <span className="tabular-nums">{formatPlainAmount(row.fee, row.currency)}</span>,
    },
  ];
  return (
    <RowCard
      density="compact"
      identity={
        <>
          <Badge variant="outline">{transactionTypeLabel(row.type)}</Badge>
          <span className="font-mono">{row.ticker ?? "—"}</span>
        </>
      }
      headline={
        // Cash-flow direction, not a return figure — plain slate, never green/red.
        <span className="text-base font-semibold tabular-nums">
          {isCashInflow(row.type) ? "+" : "−"}
          {row.currency} {formatPlainAmount(row.amount, row.currency)}
        </span>
      }
      details={details}
      badges={
        row.syncedFrom ? (
          <FromBrokerTagToggle syncedOn={row.syncedOn ?? null} connected={brokerConnected} />
        ) : undefined
      }
      meta={row.note ? row.note : undefined}
      action={
        <TransactionActions
          row={row}
          onEdit={onEdit}
          onDelete={onDelete}
          buttonClassName="size-11"
        />
      }
    />
  );
}

export function TransactionsTable({
  rows,
  transactionTypes,
  brokerConnected = false,
  onAdd,
  onEdit,
  onDelete,
}: {
  rows: TransactionRowData[];
  /** The user has a saved broker connection (chooses the "From broker" explanation). */
  brokerConnected?: boolean;
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
  // The Source column only exists when a loaded row came from the broker sync,
  // so people who never connect see no change at all.
  const showSource = rows.some((row) => row.syncedFrom);
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
            <ResponsiveRows
              breakpoint="xl"
              listLabel="Transactions"
              cards={visible.map((row) => (
                <TransactionCard key={row.id} row={row} brokerConnected={brokerConnected} onEdit={onEdit} onDelete={onDelete} />
              ))}
              table={
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
                  {showSource ? <TableHead>Source</TableHead> : null}
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
                    <TableCell>
                      {/* A max-width on the cell itself is ignored by auto table layout,
                          so the note sits in a fixed-width box: long text is cut with "…"
                          instead of running under the Source tag and the row menu. */}
                      <div className="w-28 min-[1440px]:w-40">
                        {row.note ? (
                          <Tooltip className="block w-full">
                            <TooltipTrigger className="block w-full truncate text-left">
                              {row.note}
                            </TooltipTrigger>
                            <TooltipContent>{row.note}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                    </TableCell>
                    {showSource ? (
                      <TableCell>
                        {row.syncedFrom ? (
                          <FromBrokerTag
                            syncedOn={row.syncedOn ?? null}
                            connected={brokerConnected}
                          />
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-right">
                      <TransactionActions row={row} onEdit={onEdit} onDelete={onDelete} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              }
            />
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

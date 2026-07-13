"use client";

// Transactions card for /portfolio: filterable, newest-first table of every
// transaction, with client-side "Load more" paging (25 rows at a time) and
// per-row Edit / Delete actions.
import * as React from "react";
import { TransactionType } from "@prisma/client";
import { EllipsisVertical } from "lucide-react";

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
import { formatMoney, formatQuantity, formatShortDate } from "@/lib/format";

import {
  isCashInflow,
  transactionTypeLabel,
  type TransactionRowData,
} from "./types";

const PAGE_SIZE = 25;

export function TransactionsCard({
  transactions,
  onAdd,
  onEdit,
  onDelete,
}: {
  /** Already sorted newest-first by the server page. */
  transactions: TransactionRowData[];
  onAdd: () => void;
  onEdit: (row: TransactionRowData) => void;
  onDelete: (row: TransactionRowData) => void;
}) {
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [instrumentFilter, setInstrumentFilter] = React.useState("all");
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

  // Instrument filter options: every ticker appearing in this portfolio's
  // transactions (cash-only rows have none).
  const instrumentOptions = React.useMemo(() => {
    const byId = new Map<string, string>();
    for (const t of transactions) {
      if (t.instrumentId && t.ticker) byId.set(t.instrumentId, t.ticker);
    }
    return [...byId.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [transactions]);

  const filtered = transactions.filter(
    (t) =>
      (typeFilter === "all" || t.type === typeFilter) &&
      (instrumentFilter === "all" || t.instrumentId === instrumentFilter),
  );
  const visible = filtered.slice(0, visibleCount);

  function changeTypeFilter(value: string) {
    setTypeFilter(value);
    setVisibleCount(PAGE_SIZE);
  }

  function changeInstrumentFilter(value: string) {
    setInstrumentFilter(value);
    setVisibleCount(PAGE_SIZE);
  }

  function clearFilters() {
    setTypeFilter("all");
    setInstrumentFilter("all");
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <Card className="mt-6 gap-4">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Transactions</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Filter by type"
            className="w-40"
            value={typeFilter}
            onValueChange={changeTypeFilter}
            options={[
              { value: "all", label: "All types" },
              ...Object.values(TransactionType).map((type) => ({
                value: type,
                label: transactionTypeLabel(type),
              })),
            ]}
          />
          <Select
            aria-label="Filter by instrument"
            className="w-44"
            value={instrumentFilter}
            onValueChange={changeInstrumentFilter}
            options={[{ value: "all", label: "All instruments" }, ...instrumentOptions]}
          />
          <Button onClick={onAdd}>Add Transaction</Button>
        </div>
      </CardHeader>
      <CardContent>
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
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center">
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    No transactions match these filters.
                  </span>
                  <Button variant="link" className="ml-1" onClick={clearFilters}>
                    Clear filters
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              visible.map((t) => <TransactionRow key={t.id} row={t} onEdit={onEdit} onDelete={onDelete} />)
            )}
          </TableBody>
        </Table>
        {filtered.length > visibleCount ? (
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TransactionRow({
  row,
  onEdit,
  onDelete,
}: {
  row: TransactionRowData;
  onEdit: (row: TransactionRowData) => void;
  onDelete: (row: TransactionRowData) => void;
}) {
  // Cash-flow direction is NOT a gain/loss (§2.6): plain +/− in slate,
  // never colored.
  const sign = isCashInflow(row.type) ? "+" : "−";

  return (
    <TableRow>
      <TableCell>{formatShortDate(row.tradeDate)}</TableCell>
      <TableCell>
        {/* A category, not a status judgment — no color. */}
        <Badge variant="outline">{transactionTypeLabel(row.type)}</Badge>
      </TableCell>
      <TableCell className="font-mono">{row.ticker ?? "—"}</TableCell>
      <TableCell className="text-right tabular-nums">
        {row.quantity !== null ? formatQuantity(row.quantity) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.pricePerUnit !== null
          ? formatMoney(row.pricePerUnit, row.currency)
          : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {sign}
        {formatMoney(row.amount, row.currency)}
      </TableCell>
      <TableCell>{row.currency}</TableCell>
      <TableCell className="text-right tabular-nums">
        {row.fee > 0 ? formatMoney(row.fee, row.currency) : "—"}
      </TableCell>
      <TableCell>
        {row.note ? (
          <Tooltip>
            <TooltipTrigger className="max-w-40">
              <span className="truncate text-slate-600 dark:text-slate-400">
                {row.note}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal">
              {row.note}
            </TooltipContent>
          </Tooltip>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label={`Actions for this ${transactionTypeLabel(row.type).toLowerCase()} transaction`}
            >
              <EllipsisVertical className="size-4" />
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
  );
}

"use client";

// Client root for /stocks (ui-spec §4.1): the page header + "Track a Stock"
// dialog, and the table of held-or-watched instruments. All data arrives
// pre-computed and serialized from the server page — no fetching or valuation
// happens here. Golden rule: each quote carries its SourceBadge, and a row
// with no price says so rather than showing a fake number.
import * as React from "react";
import { useRouter } from "next/navigation";
import { ChartLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { SourceBadge } from "@/components/source-badge";
import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

import { TrackStockDialog } from "./track-stock-dialog";
import { WatchStar } from "./watch-star";
import type { StockRowData } from "./types";

export function StocksView({ rows }: { rows: StockRowData[] }) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  if (rows.length === 0) {
    return (
      <>
        <EmptyState
          icon={ChartLine}
          heading="Stocks"
          sentence="Add a holding or track a stock to see it here."
          action={<Button onClick={() => setDialogOpen(true)}>Track a Stock</Button>}
        />
        <TrackStockDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Stocks</h1>
        <Button onClick={() => setDialogOpen(true)}>Track a Stock</Button>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Quote</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead />
                <TableHead className="text-right">Watch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <StockTableRow key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TrackStockDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

function StockTableRow({ row }: { row: StockRowData }) {
  const router = useRouter();

  return (
    <TableRow
      onClick={() => router.push(`/stocks/${row.id}`)}
      className="cursor-pointer"
    >
      <TableCell className="font-mono font-medium">{row.ticker}</TableCell>
      <TableCell className="text-slate-600 dark:text-slate-400">{row.name}</TableCell>
      <TableCell className="text-right">
        {row.quote.ok ? (
          <span className="inline-flex items-center justify-end gap-1.5">
            <span className="tabular-nums">
              {formatMoney(row.quote.price, row.quote.currency)}
            </span>
            <SourceBadge size="sm" {...row.quote.badge} />
          </span>
        ) : (
          // Golden rule: never a fake zero — say the price is unavailable.
          <span className="text-sm text-amber-700 dark:text-amber-400">
            No price
          </span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <ChangeCell changePct={row.changePct} />
      </TableCell>
      <TableCell>
        {row.held ? <Badge variant="secondary">Held</Badge> : null}
      </TableCell>
      <TableCell className="text-right">
        {/* The star stops propagation so it never navigates the row. */}
        <div className="flex justify-end">
          <WatchStar instrumentId={row.id} watched={row.watched} />
        </div>
      </TableCell>
    </TableRow>
  );
}

// Day change % — a genuine return figure, so green/red per §2.6. When it
// can't be derived from two closes, a plain slate em dash, never a fake 0%.
function ChangeCell({ changePct }: { changePct: number | null }) {
  if (changePct === null) {
    return <span className="text-slate-400 dark:text-slate-500">—</span>;
  }
  const color =
    changePct > 0
      ? "text-green-600 dark:text-green-400"
      : changePct < 0
        ? "text-red-600 dark:text-red-400"
        : undefined;
  return (
    <span className={cn("tabular-nums", color)}>
      {formatPercent(changePct, { signed: true })}
    </span>
  );
}

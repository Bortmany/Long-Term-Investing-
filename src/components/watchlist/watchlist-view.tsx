"use client";

// The /watchlist client view (BUILD-PLAN.md Phase 7) — owns the New/Edit
// Alert dialog's open state, same wrapper pattern as
// portfolio/portfolio-view.tsx. The server page loads and values everything.
import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SourceBadge } from "@/components/source-badge";
import { ShariaBadge } from "@/components/sharia/sharia-badge";
import { ResponsiveRows } from "@/components/ui/responsive-rows";
import { RowCard, ROW_CARD_LINK } from "@/components/ui/row-card";
import {
  CARD_LINK_TAP_AREA,
  TABLE_ROW_LINK,
  TABLE_ROW_LINKED,
  TABLE_ROW_RAISED,
} from "@/components/ui/row-link";
import { WatchToggleButton } from "@/components/stocks/watch-toggle-button";
import { formatMoney } from "@/lib/format";
import { AlertsCard } from "./alerts-card";
import { AlertDialog } from "./alert-dialog";
import type {
  AlertInstrumentOption,
  AlertRowData,
  AlertThesisOption,
  WatchlistInstrumentRow,
} from "./types";

/** The quote with its source badge, or the honest amber words. Same in table and card. */
function QuoteFigure({
  row,
  large = false,
}: {
  row: WatchlistInstrumentRow;
  large?: boolean;
}) {
  if (!row.quote.ok) {
    return (
      <span className="text-sm text-amber-700 dark:text-amber-400">
        Unavailable — no price
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span data-figure className={`tabular-nums ${large ? "text-base" : ""}`}>
        {formatMoney(row.quote.value, row.quote.currency)}
      </span>
      <span className={TABLE_ROW_RAISED}>
        <SourceBadge size="sm" {...row.quote.badge} />
      </span>
    </span>
  );
}

export function WatchlistView({
  instruments,
  alerts,
  instrumentOptions,
  thesisOptions,
}: {
  instruments: WatchlistInstrumentRow[];
  alerts: AlertRowData[];
  instrumentOptions: AlertInstrumentOption[];
  thesisOptions: AlertThesisOption[];
}) {
  const [dialog, setDialog] = React.useState<{
    open: boolean;
    editing: AlertRowData | null;
  }>({
    open: false,
    editing: null,
  });

  return (
    <>
      <Card className="mb-6 gap-4">
        <CardHeader>
          <CardTitle>Watched &amp; Held Stocks</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveRows
            listLabel="Watched and held stocks"
            cards={instruments.map((row) => (
              <RowCard
                key={row.instrumentId}
                chevron
                identity={
                  <Link
                    href={`/stocks/${row.instrumentId}`}
                    className={`${ROW_CARD_LINK} ${CARD_LINK_TAP_AREA}`}
                  >
                    {row.ticker}
                  </Link>
                }
                name={row.name}
                badges={
                  row.sharia ? (
                    <span className={TABLE_ROW_RAISED}>
                      <ShariaBadge data={row.sharia} />
                    </span>
                  ) : undefined
                }
                headline={<QuoteFigure row={row} large />}
                meta={
                  row.activeAlertCount > 0 ? (
                    <span data-figure>
                      {row.activeAlertCount} active alert
                      {row.activeAlertCount === 1 ? "" : "s"}
                    </span>
                  ) : undefined
                }
                action={
                  <WatchToggleButton
                    instrumentId={row.instrumentId}
                    initialWatched={row.watched}
                    ticker={row.ticker}
                  />
                }
              />
            ))}
            table={
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Quote</TableHead>
                    <TableHead className="text-right">Active Alerts</TableHead>
                    <TableHead>
                      <span className="sr-only">Watch</span>
                    </TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">Open</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instruments.map((row) => (
                    <TableRow
                      key={row.instrumentId}
                      className={`${TABLE_ROW_LINKED} h-14`}
                    >
                      <TableCell>
                        <Link
                          href={`/stocks/${row.instrumentId}`}
                          className={TABLE_ROW_LINK}
                        >
                          {row.ticker}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-normal break-words text-slate-600 dark:text-slate-400">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>{row.name}</span>
                          {row.sharia ? (
                            <span className={TABLE_ROW_RAISED}>
                              <ShariaBadge data={row.sharia} />
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <QuoteFigure row={row} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.activeAlertCount > 0 ? (
                          row.activeAlertCount
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className={TABLE_ROW_RAISED}>
                          <WatchToggleButton
                            instrumentId={row.instrumentId}
                            initialWatched={row.watched}
                            ticker={row.ticker}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <ChevronRight
                          aria-hidden="true"
                          className="size-4 text-slate-400"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            }
          />
        </CardContent>
      </Card>

      <AlertsCard
        alerts={alerts}
        hasPickableTargets={
          instrumentOptions.length > 0 || thesisOptions.length > 0
        }
        onNew={() => setDialog({ open: true, editing: null })}
        onEdit={(alert) => setDialog({ open: true, editing: alert })}
      />

      {dialog.open ? (
        <AlertDialog
          editing={dialog.editing}
          instrumentOptions={instrumentOptions}
          thesisOptions={thesisOptions}
          onClose={() => setDialog({ open: false, editing: null })}
        />
      ) : null}
    </>
  );
}

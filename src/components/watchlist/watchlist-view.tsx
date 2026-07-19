"use client";

// The /watchlist client view (BUILD-PLAN.md Phase 7) — owns the New/Edit
// Alert dialog's open state, same wrapper pattern as
// portfolio/portfolio-view.tsx. The server page loads and values everything.
import * as React from "react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SourceBadge } from "@/components/source-badge";
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
  const [dialog, setDialog] = React.useState<{ open: boolean; editing: AlertRowData | null }>({
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {instruments.map((row) => (
                <TableRow key={row.instrumentId}>
                  <TableCell className="font-mono font-medium">
                    <Link href={`/stocks/${row.instrumentId}`} className="hover:underline">
                      {row.ticker}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400">{row.name}</TableCell>
                  <TableCell className="text-right">
                    {row.quote.ok ? (
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <span className="tabular-nums">
                          {formatMoney(row.quote.value, row.quote.currency)}
                        </span>
                        <SourceBadge size="sm" {...row.quote.badge} />
                      </span>
                    ) : (
                      <span className="text-sm text-amber-700 dark:text-amber-400">
                        Unavailable — no price
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.activeAlertCount > 0 ? (
                      row.activeAlertCount
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <WatchToggleButton
                      instrumentId={row.instrumentId}
                      initialWatched={row.watched}
                      ticker={row.ticker}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertsCard
        alerts={alerts}
        hasPickableTargets={instrumentOptions.length > 0 || thesisOptions.length > 0}
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

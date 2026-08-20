"use client";

// The Alerts card on /watchlist (BUILD-PLAN.md Phase 7): one row per alert,
// a neutral/amber status Badge, a Tooltip revealing the last check's honest
// outcome, and a kebab DropdownMenu for Edit / Pause-or-Re-arm / Delete.
import * as React from "react";
import { Bell, EllipsisVertical, LoaderCircle, TriangleAlert } from "lucide-react";

import { deleteAlert, setAlertStatus } from "@/app/actions/alerts";
import { describeAlertRule, describeAlertTrigger } from "@/lib/alerts/describe";
import { formatShortDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AlertRowData } from "./types";

/** ACTIVE reuses the same calm-green-dot idiom as the `live` SourceBadge and
    the Thesis status chip; TRIGGERED reuses the WEAKENING amber treatment
    (a genuine "needs attention" state); PAUSED is a plain muted badge. */
function AlertStatusBadge({ status }: { status: AlertRowData["status"] }) {
  if (status === "TRIGGERED") {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 font-normal border-amber-600/30 bg-amber-50 text-amber-600 dark:border-amber-400/30 dark:bg-amber-950 dark:text-amber-400"
      >
        <TriangleAlert className="size-3.5" aria-hidden="true" />
        Triggered
      </Badge>
    );
  }
  if (status === "PAUSED") {
    return <Badge variant="secondary">Paused</Badge>;
  }
  return (
    <Badge variant="outline" className="gap-1.5 font-normal text-slate-600 dark:text-slate-400">
      <span
        aria-hidden="true"
        className="inline-block size-2 shrink-0 rounded-full bg-green-600 dark:bg-green-400"
      />
      Active
    </Badge>
  );
}

function DeleteAlertDialog({ alert, onClose }: { alert: AlertRowData; onClose: () => void }) {
  const [error, setError] = React.useState<string | null>(null);
  const [isDeleting, startDeleting] = React.useTransition();

  function handleDelete() {
    setError(null);
    startDeleting(async () => {
      const result = await deleteAlert(alert.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  const target = alert.instrumentTicker ?? alert.thesisTicker ?? "this item";
  const rule = describeAlertRule({
    kind: alert.kind,
    threshold: alert.threshold,
    currency: alert.instrumentCurrency,
    intervalDays: alert.intervalDays,
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isDeleting) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete alert?</DialogTitle>
          <DialogDescription>
            The {target} alert &ldquo;{rule}&rdquo; will be removed. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isDeleting} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isDeleting} onClick={handleDelete}>
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
    </Dialog>
  );
}

function AlertRowActions({
  alert,
  onEdit,
}: {
  alert: AlertRowData;
  onEdit: (alert: AlertRowData) => void;
}) {
  const [isPending, startTransition] = React.useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // "Pause or Re-arm": Active -> Pause; Paused or Triggered -> Re-arm (the
  // hand re-arm path — TRIGGERED thesis alerts also re-arm automatically
  // once a newer check exists, see src/lib/alerts/engine.ts).
  const toggleLabel = alert.status === "ACTIVE" ? "Pause" : "Re-arm";
  const nextStatus = alert.status === "ACTIVE" ? "PAUSED" : "ACTIVE";

  function handleToggleStatus() {
    setError(null);
    startTransition(async () => {
      const result = await setAlertStatus(alert.id, nextStatus);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={`Actions for the ${alert.instrumentTicker ?? alert.thesisTicker ?? ""} alert`}
          >
            <EllipsisVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => onEdit(alert)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={handleToggleStatus} disabled={isPending}>
            {toggleLabel}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      {confirmDelete ? <DeleteAlertDialog alert={alert} onClose={() => setConfirmDelete(false)} /> : null}
    </>
  );
}

export function AlertsCard({
  alerts,
  hasPickableTargets,
  onNew,
  onEdit,
}: {
  alerts: AlertRowData[];
  hasPickableTargets: boolean;
  onNew: () => void;
  onEdit: (alert: AlertRowData) => void;
}) {
  return (
    <Card className="gap-4">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Alerts</CardTitle>
        <Button type="button" size="sm" onClick={onNew} disabled={!hasPickableTargets}>
          <Bell aria-hidden="true" />
          New Alert
        </Button>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <EmptyState
            icon={Bell}
            heading="Alerts"
            sentence="Get notified when a price moves or a thesis is due for review."
            action={
              hasPickableTargets ? (
                <Button type="button" onClick={onNew}>
                  New Alert
                </Button>
              ) : undefined
            }
            className="min-h-48"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Alert</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Checked</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell>
                    <div className="font-medium">
                      {describeAlertRule({
                        kind: alert.kind,
                        threshold: alert.threshold,
                        currency: alert.instrumentCurrency,
                        intervalDays: alert.intervalDays,
                      })}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {alert.instrumentTicker ?? alert.thesisTicker}
                    </div>
                    {/* A triggered alert says what happened next to what was
                        asked for, in the row itself — not only on hover,
                        which a touch screen can't do. */}
                    {alert.status === "TRIGGERED" ? (
                      <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        {describeAlertTrigger({
                          kind: alert.kind,
                          threshold: alert.threshold,
                          currency: alert.instrumentCurrency,
                          intervalDays: alert.intervalDays,
                          happened: alert.lastOutcome,
                        })}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <AlertStatusBadge status={alert.status} />
                  </TableCell>
                  <TableCell className="text-slate-500 dark:text-slate-400">
                    {alert.lastEvaluatedAt ? (
                      <Tooltip>
                        <TooltipTrigger className="underline decoration-dotted underline-offset-2">
                          {formatShortDate(alert.lastEvaluatedAt)}
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64 whitespace-normal text-left">
                          {alert.lastOutcome ?? "Checked — no details recorded."}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      "Not checked yet"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <AlertRowActions alert={alert} onEdit={onEdit} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

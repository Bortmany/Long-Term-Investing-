"use client";

// Client root for /theses (ui-spec §5.1): the page header + "New Thesis"
// dialog, the Active/Closed filter chips, and the table. All data arrives
// pre-computed and serialized from the server page — no fetching happens
// here. Golden rule: the integrity score has no source badge (it's an AI
// figure, its provenance is the check's own AiPanel caption on the detail
// page) but "Last Checked" and the trend arrow are plain facts about
// persisted rows, never fabricated.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Minus, MoreVertical, TrendingDown, TrendingUp } from "lucide-react";

import { closeThesis, reopenThesis } from "@/app/actions/theses";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { NewThesisDialog } from "./new-thesis-dialog";
import type { InstrumentOption, ThesisRowData } from "./types";

type Filter = "ACTIVE" | "CLOSED";

// Same navigation-link classes the Holdings card uses for row actions that
// are really links, matching that existing precedent.
const menuLinkClasses =
  "block w-full px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800";

export function ThesesView({
  rows,
  instrumentOptions,
}: {
  rows: ThesisRowData[];
  instrumentOptions: InstrumentOption[];
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<Filter>("ACTIVE");

  const activeCount = rows.filter((r) => r.status === "ACTIVE").length;
  const closedCount = rows.filter((r) => r.status === "CLOSED").length;

  if (rows.length === 0) {
    return (
      <>
        <EmptyState
          icon={BookOpen}
          heading="Theses"
          sentence="Track why you own a position and let AI check if it still holds up."
          action={<Button onClick={() => setDialogOpen(true)}>New Thesis</Button>}
        />
        <NewThesisDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          instrumentOptions={instrumentOptions}
        />
      </>
    );
  }

  const filteredRows = rows.filter((row) => row.status === filter);

  return (
    <>
      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Theses</h1>
        <Button onClick={() => setDialogOpen(true)}>New Thesis</Button>
      </div>

      <div className="mb-4 flex gap-2">
        <FilterChip
          label={`Active (${activeCount})`}
          active={filter === "ACTIVE"}
          onClick={() => setFilter("ACTIVE")}
        />
        <FilterChip
          label={`Closed (${closedCount})`}
          active={filter === "CLOSED"}
          onClick={() => setFilter("CLOSED")}
        />
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {filteredRows.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              No {filter === "ACTIVE" ? "active" : "closed"} theses yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instrument</TableHead>
                  <TableHead>Statement</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Latest Integrity Score</TableHead>
                  <TableHead>Last Checked</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <ThesisTableRow key={row.id} row={row} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <NewThesisDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        instrumentOptions={instrumentOptions}
      />
    </>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1 text-sm font-medium transition-colors",
        active
          ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
          : "border-slate-200 bg-transparent text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900",
      )}
    >
      {label}
    </button>
  );
}

function ThesisTableRow({ row }: { row: ThesisRowData }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function toggleStatus() {
    startTransition(async () => {
      const result =
        row.status === "ACTIVE" ? await closeThesis(row.id) : await reopenThesis(row.id);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <TableRow onClick={() => router.push(`/theses/${row.id}`)} className="cursor-pointer">
      <TableCell>
        <span className="font-mono font-medium">{row.instrumentTicker}</span>{" "}
        <span className="text-slate-600 dark:text-slate-400">{row.instrumentName}</span>
      </TableCell>
      <TableCell className="max-w-xs truncate text-slate-600 dark:text-slate-400">
        {row.statement}
      </TableCell>
      <TableCell>
        <StatusBadge status={row.status} />
      </TableCell>
      <TableCell className="text-right">
        <ScoreCell scores={row.recentScores} />
      </TableCell>
      <TableCell>
        {row.lastCheckedAt ? formatShortDate(row.lastCheckedAt) : "—"}
      </TableCell>
      <TableCell className="text-right">
        <div
          className="flex justify-end"
          // Actions never bubble to the row's own navigation.
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={`Actions for ${row.instrumentTicker} thesis`}
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <Link role="menuitem" className={menuLinkClasses} href={`/theses/${row.id}`}>
                View details
              </Link>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleStatus} disabled={isPending}>
                {row.status === "ACTIVE" ? "Close thesis" : "Reopen thesis"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

/** ACTIVE reuses the calm "live" green dot idiom; CLOSED is a plain muted badge. */
function StatusBadge({ status }: { status: "ACTIVE" | "CLOSED" }) {
  if (status === "ACTIVE") {
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
  return <Badge variant="secondary">Closed</Badge>;
}

/** Neutral trend arrow comparing the two most recent checks (§5.1) — never colored. */
function ScoreCell({ scores }: { scores: number[] }) {
  if (scores.length === 0) {
    return <span className="text-slate-400 dark:text-slate-500">—</span>;
  }
  const [latest, previous] = scores;
  let Arrow: typeof TrendingUp | null = null;
  if (previous !== undefined) {
    if (latest > previous) Arrow = TrendingUp;
    else if (latest < previous) Arrow = TrendingDown;
    else Arrow = Minus;
  }
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span className="tabular-nums">{latest}</span>
      {Arrow ? (
        <Arrow
          className="size-4 text-slate-500 dark:text-slate-400"
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
}

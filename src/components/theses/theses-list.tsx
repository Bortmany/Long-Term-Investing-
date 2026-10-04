"use client";

// The /theses list body (ui-spec §5.1) — ACTIVE/CLOSED filter chips + table.
// Owns the filter's local state; the server page hands down every thesis row
// once and this component slices it client-side (small personal-scale list,
// same idiom as the /portfolio filter selects).
import * as React from "react";
import Link from "next/link";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ThesisStatus } from "@prisma/client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResponsiveRows } from "@/components/ui/responsive-rows";
import { ROW_CARD_LINK, RowCard } from "@/components/ui/row-card";
import { formatShortDate } from "@/lib/format";
import type { TrendDirection } from "@/lib/theses/checks";
import { cn } from "@/lib/utils";
import { ThesisStatusChip } from "./thesis-status-chip";

export type ThesisListRow = {
  id: string;
  ticker: string;
  name: string;
  statement: string;
  status: ThesisStatus;
  latestScore: number | null;
  trend: TrendDirection | null;
  lastCheckedAt: Date | null;
};

// The arrow is neutral slate (AI scores are never green or red). A hidden text
// label says the same thing in words, so it is not icon-only.
const TREND_LABEL: Record<TrendDirection, string> = {
  up: "Up since the previous check",
  down: "Down since the previous check",
  flat: "Steady",
};

function TrendArrow({ trend }: { trend: TrendDirection | null }) {
  if (!trend) return null;
  const className = "size-3.5 text-slate-500 dark:text-slate-400";
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  return (
    <>
      <Icon className={className} aria-hidden="true" />
      <span className="sr-only">{TREND_LABEL[trend]}</span>
    </>
  );
}

/**
 * One thesis as a phone card (shown below 768px). Same status, score and
 * last-checked as the table row. The score is an AI judgment, so it stays
 * neutral and carries no source badge. The whole card is one link.
 */
function ThesisCard({ row }: { row: ThesisListRow }) {
  return (
    <RowCard
      chevron
      identity={
        <div className="flex w-full min-w-0 items-center gap-2">
          <Link
            href={`/theses/${row.id}`}
            className={cn(ROW_CARD_LINK, "inline-flex min-h-11 items-center")}
          >
            {row.ticker}
          </Link>
          <span className="min-w-0 flex-1 truncate text-sm text-slate-500 dark:text-slate-400">
            {row.name}
          </span>
          <ThesisStatusChip status={row.status} />
        </div>
      }
      headline={
        <p className="line-clamp-2 w-full text-sm text-slate-600 dark:text-slate-400">
          {row.statement}
        </p>
      }
      details={[
        {
          label: "Integrity score",
          value:
            row.latestScore === null ? (
              <span className="text-slate-500 dark:text-slate-400">No score yet</span>
            ) : (
              <span
                data-figure
                className="inline-flex items-center gap-1.5 text-2xl font-semibold tabular-nums"
              >
                {row.latestScore}
                <TrendArrow trend={row.trend} />
              </span>
            ),
        },
        {
          label: "Last checked",
          value: row.lastCheckedAt ? (
            formatShortDate(row.lastCheckedAt)
          ) : (
            <span className="text-slate-500 dark:text-slate-400">Never checked</span>
          ),
        },
      ]}
    />
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-md border px-4 py-1.5 text-sm md:min-h-0 md:px-3 font-medium transition-colors",
        active
          ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
          : "border-border text-slate-600 hover:bg-accent hover:text-accent-foreground dark:text-slate-400",
      )}
    >
      {children}
    </button>
  );
}

export function ThesesList({ rows }: { rows: ThesisListRow[] }) {
  const [filter, setFilter] = React.useState<ThesisStatus>("ACTIVE");
  const activeCount = rows.filter((row) => row.status === "ACTIVE").length;
  const closedCount = rows.filter((row) => row.status === "CLOSED").length;
  const filtered = rows.filter((row) => row.status === filter);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <FilterChip active={filter === "ACTIVE"} onClick={() => setFilter("ACTIVE")}>
          Active ({activeCount})
        </FilterChip>
        <FilterChip active={filter === "CLOSED"} onClick={() => setFilter("CLOSED")}>
          Closed ({closedCount})
        </FilterChip>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          {filter === "ACTIVE"
            ? "No active theses yet. A thesis is just your reason for owning a stock, in your own words."
            : "No closed theses yet. When you stop owning a stock, close its thesis and it will rest here."}
        </p>
      ) : (
        <ResponsiveRows
          listLabel="Theses"
          cards={filtered.map((row) => (
            <ThesisCard key={row.id} row={row} />
          ))}
          table={
        <Table className="[&_th]:whitespace-normal">
          <TableHeader>
            <TableRow>
              <TableHead>Instrument</TableHead>
              <TableHead>Statement</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Latest Integrity Score</TableHead>
              <TableHead>Last Checked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-normal break-words font-medium">
                  <Link
                    href={`/theses/${row.id}`}
                    className="-my-2.5 inline-flex min-h-11 flex-wrap items-center gap-x-1 hover:underline"
                  >
                    <span className="font-mono">{row.ticker}</span>
                    <span className="text-slate-500 dark:text-slate-400">{row.name}</span>
                  </Link>
                </TableCell>
                <TableCell className="max-w-40 truncate lg:max-w-64 text-slate-600 dark:text-slate-400">
                  {row.statement}
                </TableCell>
                <TableCell>
                  <ThesisStatusChip status={row.status} />
                </TableCell>
                <TableCell className="text-right">
                  {row.latestScore === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span data-figure className="inline-flex items-center justify-end gap-1.5 text-base font-semibold tabular-nums">
                      {row.latestScore}
                      <TrendArrow trend={row.trend} />
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-slate-500 dark:text-slate-400">
                  {row.lastCheckedAt ? formatShortDate(row.lastCheckedAt) : "Never checked"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
          }
        />
      )}
    </div>
  );
}

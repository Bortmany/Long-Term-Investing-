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

function TrendArrow({ trend }: { trend: TrendDirection | null }) {
  const className = "size-3.5 text-slate-500 dark:text-slate-400";
  if (trend === "up") return <TrendingUp className={className} aria-hidden="true" />;
  if (trend === "down") return <TrendingDown className={className} aria-hidden="true" />;
  if (trend === "flat") return <Minus className={className} aria-hidden="true" />;
  return null;
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
        "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  <Link href={`/theses/${row.id}`} className="hover:underline">
                    <span className="font-mono">{row.ticker}</span>{" "}
                    <span className="text-slate-500 dark:text-slate-400">{row.name}</span>
                  </Link>
                </TableCell>
                <TableCell className="max-w-64 truncate text-slate-600 dark:text-slate-400">
                  {row.statement}
                </TableCell>
                <TableCell>
                  <ThesisStatusChip status={row.status} />
                </TableCell>
                <TableCell className="text-right">
                  {row.latestScore === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
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
      )}
    </div>
  );
}

"use client";

// Financial Statements card (ui-spec §4.2) — Income / Balance Sheet / Cash
// Flow tabs, fiscal periods as columns, line items as rows. One SourceBadge
// per period column header (not per cell): a single getFinancialStatements
// call returns every period from one fetch, so every cell under a column
// shares that exact provenance — a per-column badge is the honest
// granularity here, unlike the Holdings table where each row can genuinely
// differ in source.
import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SourceBadge } from "@/components/source-badge";
import { cn } from "@/lib/utils";
import { formatQuantity } from "@/lib/format";
import type { StatementBlock } from "./types";

type StatementKindKey = "income" | "balance" | "cashFlow";

/**
 * Scroll aids for the statements grid on a phone: tells the table whether it
 * has been scrolled sideways (pinned-column shadow) and whether more periods
 * are still off-screen (permanent right-edge fade). Direction-aware (RTL).
 */
function useScrollAids(frame: React.RefObject<HTMLDivElement | null>) {
  const [scrolled, setScrolled] = React.useState(false);
  const [moreAhead, setMoreAhead] = React.useState(false);

  React.useEffect(() => {
    const box = frame.current?.querySelector<HTMLElement>(
      '[data-slot="table-container"]',
    );
    if (!box) return;
    const update = () => {
      const offset = Math.abs(box.scrollLeft);
      setScrolled(offset > 1);
      setMoreAhead(box.scrollWidth - box.clientWidth - offset > 1);
    };
    update();
    box.addEventListener("scroll", update, { passive: true });
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(box);
    if (box.firstElementChild) observer?.observe(box.firstElementChild);
    return () => {
      box.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [frame]);

  return { scrolled, moreAhead };
}

function StatementBlockView({ block }: { block: StatementBlock }) {
  if (!block.ok) {
    return (
      <p className="py-6 text-sm text-slate-500 dark:text-slate-400">
        {block.message}
      </p>
    );
  }
  const { table, badge } = block;
  if (table.periods.length === 0 || table.rows.length === 0) {
    return (
      <p className="py-6 text-sm text-slate-500 dark:text-slate-400">
        No financial statement data reported.
      </p>
    );
  }
  return (
    <StatementGrid table={table} badge={badge} />
  );
}

function StatementGrid({
  table,
  badge,
}: {
  table: Extract<StatementBlock, { ok: true }>["table"];
  badge: Extract<StatementBlock, { ok: true }>["badge"];
}) {
  const frame = React.useRef<HTMLDivElement>(null);
  const { scrolled, moreAhead } = useScrollAids(frame);
  // The pinned first column: 120px at most, label wraps, opaque so periods
  // slide under it, with a soft shadow on its trailing edge once scrolled.
  const pinned = cn(
    "sticky start-0 z-10 w-[120px] min-w-0 max-w-[120px] whitespace-normal bg-card",
    "after:pointer-events-none after:absolute after:inset-y-0 after:-end-2 after:w-2",
    "after:bg-gradient-to-r after:from-slate-900/10 after:to-transparent rtl:after:bg-gradient-to-l",
    "after:transition-opacity",
    scrolled ? "after:opacity-100" : "after:opacity-0",
  );
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        Figures as reported by the data provider
        {table.reportedCurrency ? `, in ${table.reportedCurrency}` : ""}.
      </p>
      <p className="mb-2 text-xs text-slate-500 md:hidden dark:text-slate-400">
        Swipe sideways to see earlier periods.
      </p>
      <div ref={frame} className="relative">
      <Table allowScroll="statements">
        <TableHeader>
          <TableRow>
            <TableHead className={cn(pinned, "text-start")}>Line Item</TableHead>
            {table.periods.map((period, index) => (
              <TableHead key={`${period}-${index}`} className="min-w-24 text-end">
                <span className="inline-flex items-center justify-end gap-1.5">
                  {period}
                  <SourceBadge size="sm" {...badge} />
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell
                className={cn(pinned, "text-slate-600 dark:text-slate-400")}
              >
                {row.label}
              </TableCell>
              {row.values.map((value, index) => (
                <TableCell key={index} data-figure className="min-w-24 text-end tabular-nums">
                  {value === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    formatQuantity(value)
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* Permanent fade while more periods are off-screen. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 end-0 z-20 w-6 bg-gradient-to-l from-card to-transparent transition-opacity rtl:bg-gradient-to-r",
          moreAhead ? "opacity-100" : "opacity-0",
        )}
      />
      </div>
    </div>
  );
}

export function FinancialStatementsCard({
  income,
  balance,
  cashFlow,
}: {
  income: StatementBlock;
  balance: StatementBlock;
  cashFlow: StatementBlock;
}) {
  const [tab, setTab] = React.useState<StatementKindKey>("income");

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Financial Statements</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as StatementKindKey)}
        >
          <TabsList>
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
            <TabsTrigger value="cashFlow">Cash Flow</TabsTrigger>
          </TabsList>
          <TabsContent value="income">
            <StatementBlockView block={income} />
          </TabsContent>
          <TabsContent value="balance">
            <StatementBlockView block={balance} />
          </TabsContent>
          <TabsContent value="cashFlow">
            <StatementBlockView block={cashFlow} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

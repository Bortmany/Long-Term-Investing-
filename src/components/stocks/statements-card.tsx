"use client";

// Financial Statements card (ui-spec §4.2): Tabs for Income / Balance Sheet /
// Cash Flow, each a Table with fiscal periods as COLUMNS (newest leftmost) and
// line items as ROWS. Source-badge placement is deliberately per PERIOD-COLUMN
// HEADER, not per cell: one getFinancialStatements fetch returns all periods
// from a single source/asOf, so every cell under a header shares that exact
// provenance — a per-column badge is the honest granularity here (unlike the
// Holdings table, where each row can genuinely have a different source).
import * as React from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { formatMoney } from "@/lib/format";
import type { BadgeProps } from "./types";

/** One statement tab's data, or the typed "unavailable" branch. */
export type StatementTabData =
  | {
      ok: true;
      /** The reporting currency for the figures in this table. */
      currency: string;
      /** Period columns, newest first (leftmost), each with its source badge. */
      periods: { label: string; badge: BadgeProps }[];
      /** Line-item rows; `values` align to `periods`, null for a missing cell. */
      rows: { label: string; values: (number | null)[] }[];
    }
  | { ok: false };

export type StatementsData = {
  income: StatementTabData;
  balance: StatementTabData;
  cashFlow: StatementTabData;
};

const TABS: { value: keyof StatementsData; label: string }[] = [
  { value: "income", label: "Income" },
  { value: "balance", label: "Balance Sheet" },
  { value: "cashFlow", label: "Cash Flow" },
];

export function StatementsCard({ statements }: { statements: StatementsData }) {
  const [tab, setTab] = React.useState<keyof StatementsData>("income");

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Financial Statements</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as keyof StatementsData)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((t) => (
            <TabsContent key={t.value} value={t.value}>
              <StatementTable data={statements[t.value]} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function StatementTable({ data }: { data: StatementTabData }) {
  if (!data.ok) {
    // Golden rule: no empty table shell standing in for missing data.
    return (
      <p className="py-6 text-sm text-slate-500 dark:text-slate-400">
        Financial statements require a live market-data connection for this
        instrument.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Line item</TableHead>
          {data.periods.map((period, i) => (
            <TableHead key={i} className="text-right">
              <span className="inline-flex items-center justify-end gap-1.5">
                {period.label}
                <SourceBadge size="sm" {...period.badge} />
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.rows.map((row, ri) => (
          <TableRow key={ri}>
            <TableCell className="font-medium">{row.label}</TableCell>
            {row.values.map((value, ci) => (
              <TableCell key={ci} className="text-right tabular-nums">
                {value === null ? (
                  <span className="text-slate-400 dark:text-slate-500">—</span>
                ) : (
                  formatMoney(value, data.currency)
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

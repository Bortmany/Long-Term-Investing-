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
import { formatQuantity } from "@/lib/format";
import type { StatementBlock } from "./types";

type StatementKindKey = "income" | "balance" | "cashFlow";

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
    <div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        Figures as reported by the data provider
        {table.reportedCurrency ? `, in ${table.reportedCurrency}` : ""}.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Line Item</TableHead>
            {table.periods.map((period, index) => (
              <TableHead key={`${period}-${index}`} className="text-right">
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
              <TableCell className="text-slate-600 dark:text-slate-400">
                {row.label}
              </TableCell>
              {row.values.map((value, index) => (
                <TableCell key={index} className="text-right tabular-nums">
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

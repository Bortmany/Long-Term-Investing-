// Past Runs table (ui-spec §6.5) — every Committee / Buy Analysis / Sell
// Analysis run for the currently-selected instrument, newest first.
// Server-renderable (no client state needed) — each row's cells are wrapped
// in a Link to /committee/history/[id] so the whole row reads as clickable.
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatShortDate } from "@/lib/format";
import {
  buyAnalysisSchema,
  committeeOutputSchema,
  sellAnalysisSchema,
} from "@/lib/ai/schemas";
import { VerdictChip } from "./verdict-chip";

export type PastRunType = "COMMITTEE" | "BUY_ANALYSIS" | "SELL_ANALYSIS";

export type PastRunRow = {
  id: string;
  type: PastRunType;
  model: string;
  createdAt: Date;
  output: unknown;
};

const TYPE_LABELS: Record<PastRunType, string> = {
  COMMITTEE: "Committee",
  BUY_ANALYSIS: "Buy Analysis",
  SELL_ANALYSIS: "Sell Analysis",
};

function ResultCell({ type, output }: { type: PastRunType; output: unknown }) {
  if (type === "COMMITTEE") {
    const parsed = committeeOutputSchema.safeParse(output);
    return parsed.success ? (
      <VerdictChip verdict={parsed.data.verdict} />
    ) : (
      <span className="text-slate-400">—</span>
    );
  }
  if (type === "BUY_ANALYSIS") {
    const parsed = buyAnalysisSchema.safeParse(output);
    return parsed.success ? (
      <span className="tabular-nums">{parsed.data.score}/100</span>
    ) : (
      <span className="text-slate-400">—</span>
    );
  }
  const parsed = sellAnalysisSchema.safeParse(output);
  return parsed.success ? (
    <span className="tabular-nums">{parsed.data.sellScore}/100</span>
  ) : (
    <span className="text-slate-400">—</span>
  );
}

const ROW_LINK_CLASS = "block px-2 py-2.5";

export function PastRunsTable({ rows }: { rows: PastRunRow[] }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Past Runs</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            No runs yet for this stock.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Verdict / Score</TableHead>
                <TableHead>Model</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="p-0">
                    <Link href={`/committee/history/${row.id}`} className={ROW_LINK_CLASS}>
                      {formatShortDate(row.createdAt)}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={`/committee/history/${row.id}`} className={ROW_LINK_CLASS}>
                      <Badge variant="secondary">{TYPE_LABELS[row.type]}</Badge>
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={`/committee/history/${row.id}`} className={ROW_LINK_CLASS}>
                      <ResultCell type={row.type} output={row.output} />
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={`/committee/history/${row.id}`} className={ROW_LINK_CLASS}>
                      {row.model}
                    </Link>
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

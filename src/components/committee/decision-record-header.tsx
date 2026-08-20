// The header of a saved decision record (/committee/history/[id]) — the
// factual cover sheet for one past run: what it was, which stock it was
// about, when it was recorded, how fresh the data behind it was, which
// thesis it belongs to, and whether a newer run has since replaced it.
//
// Everything here is plain record-keeping read from the database. The
// judgment itself (verdict, consensus, votes) stays inside the AiPanel
// below, where its "Analysis from … · model · data as of …" caption and the
// AiDisclaimer live — this header never repeats an AI figure without them.
import Link from "next/link";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatShortDate } from "@/lib/format";

export type DecisionRecordHeaderProps = {
  /** What kind of run this record is, in plain English. */
  kindLabel: string;
  instrumentId: string;
  ticker: string;
  name: string;
  /** When the run was saved. */
  recordedAt: Date;
  /** How fresh the market data behind the run was. */
  dataAsOf: Date;
  /** The open thesis for this stock, if there is one. */
  thesisId: string | null;
  /** A later run of the same kind for the same stock, if one exists. */
  supersededBy: { id: string; createdAt: Date } | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export function DecisionRecordHeader({
  kindLabel,
  instrumentId,
  ticker,
  name,
  recordedAt,
  dataAsOf,
  thesisId,
  supersededBy,
}: DecisionRecordHeaderProps) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Decision record
        </p>
        {/* A real <h1>: this card is the page's title block. */}
        <h1 className="text-xl font-semibold leading-none">
          {kindLabel} — <span className="font-mono">{ticker}</span>
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">{name}</p>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Recorded on">{formatShortDate(recordedAt)}</Field>
          <Field label="Based on data as of">{formatShortDate(dataAsOf)}</Field>
          <Field label="Stock">
            <Link
              href={`/stocks/${instrumentId}`}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              View research
            </Link>
          </Field>
          <Field label="Your thesis">
            {thesisId ? (
              <Link
                href={`/theses/${thesisId}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                Open thesis
              </Link>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                No open thesis for this stock
              </span>
            )}
          </Field>
        </dl>
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          {supersededBy ? (
            <>
              A newer run was recorded on {formatShortDate(supersededBy.createdAt)}.{" "}
              <Link
                href={`/committee/history/${supersededBy.id}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                Open the newer record
              </Link>
              .
            </>
          ) : (
            <>This is the most recent run of its kind on record for {ticker}.</>
          )}{" "}
          Saved records are never re-run when you open this page.
        </p>
      </CardContent>
    </Card>
  );
}

"use client";

// Screen 3: "Check" (UI spec section 4). Shows exactly what InvestIQ
// understood, in five collapsible groups, before anything is saved.
// Every figure is copied from the person's own file; nothing is made up.

import * as React from "react";
import Link from "next/link";
import {
  ChevronDown,
  CircleCheck,
  History,
  Info,
  LoaderCircle,
  SkipForward,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  figureText,
  formatDate,
  groupByReason,
  hasFee,
  isTrade,
  plural,
  summarySentence,
  typeLabel,
  type CheckModel,
  type DisplayRow,
  type NeedItem,
  type SkippedItem,
} from "./check-model";
import { StickyActions } from "./sticky-actions";

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

type GroupTone = "success" | "destructive" | "warning" | "default";

const TONE_BORDER: Record<GroupTone, string> = {
  success: "border-green-600/50 border-l-green-600",
  destructive: "border-red-600/50 border-l-red-600",
  warning: "border-amber-600/50 border-l-amber-600",
  default: "border-slate-300 border-l-slate-400 dark:border-slate-700 dark:border-l-slate-500",
};
const TONE_ICON: Record<GroupTone, string> = {
  success: "text-green-600 dark:text-green-400",
  destructive: "text-red-600 dark:text-red-400",
  warning: "text-amber-700 dark:text-amber-400",
  default: "text-slate-500 dark:text-slate-400",
};

/** A group with a full-width header button (min 44px) and a show/hide body. */
function Group({
  tone,
  icon: Icon,
  title,
  count,
  defaultOpen,
  children,
}: {
  tone: GroupTone;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  title: string;
  count: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const bodyId = React.useId();
  return (
    <section className={cn("rounded-lg border border-l-4 bg-card", TONE_BORDER[tone])}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-4 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon className={cn("size-4 shrink-0", TONE_ICON[tone])} aria-hidden="true" />
        <span className="text-sm font-semibold">{title}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {count}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto size-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400",
            open ? "rotate-180" : null,
          )}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div id={bodyId} className="space-y-3 px-4 pb-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** Shows the first few items, with "Show all N" / "Show fewer". */
function Limited<T>({
  items,
  limit = 5,
  children,
}: {
  items: T[];
  limit?: number;
  children: (visible: T[]) => React.ReactNode;
}) {
  const [all, setAll] = React.useState(false);
  const visible = all ? items : items.slice(0, limit);
  return (
    <>
      {children(visible)}
      {items.length > limit ? (
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full"
          aria-expanded={all}
          onClick={() => setAll((a) => !a)}
        >
          {all ? "Show fewer" : `Show all ${items.length}`}
        </Button>
      ) : null}
    </>
  );
}

function QuietLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** The broker's raw line: wraps, max 3 lines, never a sideways scroll. */
function RawLine({ raw }: { raw: string }) {
  const [full, setFull] = React.useState(false);
  const long = raw.length > 140;
  return (
    <div>
      <p
        className={cn(
          "font-mono text-xs break-all whitespace-pre-wrap text-slate-500 dark:text-slate-400",
          !full && long ? "line-clamp-3" : null,
        )}
      >
        {raw}
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setFull((f) => !f)}
          aria-expanded={full}
          className="inline-flex min-h-11 items-center text-xs text-blue-600 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-400"
        >
          {full ? "Show less" : "Show full line"}
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row lists
// ---------------------------------------------------------------------------

function secondLine(row: DisplayRow): string {
  const parts = [formatDate(row.date)];
  if (hasFee(row.fee)) {
    const t = row.type.trim().toUpperCase();
    if (t === "DIVIDEND") parts.push(`Tax withheld ${row.fee}`);
    else if (isTrade(row.type)) parts.push(`Fee ${row.fee}`);
  }
  return parts.join(" · ");
}

/** Ready-style rows: two-line items on a phone, a table on a laptop. */
function TradeRows({
  rows,
  showRowNumber = false,
  showFile = false,
}: {
  rows: DisplayRow[];
  showRowNumber?: boolean;
  showFile?: boolean;
}) {
  return (
    <>
      <ul className="lg:hidden">
        {rows.map((row) => (
          <li
            key={row.key}
            className="border-b border-slate-200 py-3 last:border-0 dark:border-slate-800"
          >
            {showRowNumber ? (
              <p className="mb-1 text-xs font-medium">
                Row {row.line}
                {showFile && row.file ? ` · ${row.file}` : ""}
              </p>
            ) : null}
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-sm font-semibold break-words">
                {typeLabel(row.type)}
                {row.ticker ? ` ${row.ticker}` : ""}
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">{figureText(row)}</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{secondLine(row)}</p>
            {row.importNote ? <p className="mt-1 text-sm">{row.importNote}</p> : null}
          </li>
        ))}
      </ul>
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              {showRowNumber ? <TableHead className="w-16">Row #</TableHead> : null}
              <TableHead>Type</TableHead>
              <TableHead>Ticker</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead className="text-right">Fee or tax</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <React.Fragment key={row.key}>
                <TableRow>
                  {showRowNumber ? <TableCell className="tabular-nums">{row.line}</TableCell> : null}
                  <TableCell>{typeLabel(row.type)}</TableCell>
                  <TableCell>{row.ticker ?? ""}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(row.date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.quantity ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.price ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.amount ?? ""}</TableCell>
                  <TableCell>{row.currency ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {hasFee(row.fee) ? row.fee : ""}
                  </TableCell>
                </TableRow>
                {row.importNote ? (
                  <TableRow>
                    <TableCell colSpan={showRowNumber ? 9 : 8} className="text-sm whitespace-normal">
                      {row.importNote}
                    </TableCell>
                  </TableRow>
                ) : null}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function NeedRows({ items, showFile }: { items: NeedItem[]; showFile: boolean }) {
  return (
    <>
      <ul className="space-y-3 lg:hidden">
        {items.map((item) => (
          <li
            key={item.key}
            className="rounded-md border border-slate-200 p-3 dark:border-slate-800"
          >
            <p className="text-sm">
              <span className="font-medium">Row {item.line}</span>
              {showFile && item.file ? (
                <span className="text-xs text-slate-500 dark:text-slate-400"> · {item.file}</span>
              ) : null}
            </p>
            {item.reasons.map((reason, i) => (
              <p key={i} className="text-sm text-red-600 dark:text-red-400">
                {reason}
              </p>
            ))}
            <div className="mt-1">
              <RawLine raw={item.raw} />
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Row #</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead>Raw row data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.key}>
                <TableCell className="align-top tabular-nums">{item.line}</TableCell>
                <TableCell className="align-top whitespace-normal">
                  {item.reasons.map((reason, i) => (
                    <p key={i} className="text-sm text-red-600 dark:text-red-400">
                      {reason}
                    </p>
                  ))}
                  {showFile && item.file ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.file}</p>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-md align-top whitespace-normal">
                  <RawLine raw={item.raw} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function SkippedRows({ items, showFile }: { items: SkippedItem[]; showFile: boolean }) {
  return (
    <ul>
      {items.map((item) => (
        <li
          key={item.key}
          className="border-b border-slate-200 py-3 last:border-0 dark:border-slate-800"
        >
          <p className="text-sm">
            <span className="font-medium">Row {item.line}</span>
            {showFile && item.file ? (
              <span className="text-xs text-slate-500 dark:text-slate-400"> · {item.file}</span>
            ) : null}
          </p>
          <p className="text-sm">{item.reason}</p>
          <RawLine raw={item.raw} />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// The step itself
// ---------------------------------------------------------------------------

export function CheckStep({
  model,
  isImporting,
  isRechecking,
  onBack,
  onImport,
  onImportAnother,
  onRecheck,
}: {
  model: CheckModel;
  isImporting: boolean;
  isRechecking: boolean;
  onBack: () => void;
  onImport: () => void;
  onImportAnother: () => void;
  onRecheck: () => void;
}) {
  const readyCount = model.ready.length;
  const needsCount = model.needs.length;
  const skippedCount = model.skipped.length;
  const alreadyCount = model.already.length;
  const noted = model.ready.filter((r) => r.importNote);
  const plainReady = model.ready.filter((r) => !r.importNote);
  const totalFound = readyCount + needsCount + skippedCount + alreadyCount;
  const upToDate = readyCount === 0 && needsCount === 0 && alreadyCount > 0 && !model.tooMany;
  const canImport = readyCount > 0 && !model.tooMany;
  const busy = isImporting || isRechecking;

  const files = new Set<string>();
  for (const list of [model.ready, model.already, model.needs, model.skipped]) {
    for (const item of list) if (item.file) files.add(item.file);
  }
  const showFile = files.size > 1;

  const importLabel = `Import ${readyCount} ${plural(readyCount, "transaction", "transactions")}`;
  const importButton = canImport ? (
    <Button type="button" size="lg" onClick={onImport} disabled={busy}>
      {isImporting ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          Importing...
        </>
      ) : (
        importLabel
      )}
    </Button>
  ) : null;

  // The plain "what this will not do" lines next to the button.
  const notAdded: string[] = [];
  if (skippedCount > 0) notAdded.push(`${skippedCount} skipped`);
  if (alreadyCount > 0) notAdded.push(`${alreadyCount} already imported`);
  const noteLines: string[] = [];
  if (canImport && notAdded.length > 0) {
    noteLines.push(`${notAdded.join(" and ")} ${plural(skippedCount + alreadyCount, "row", "rows")} will not be added.`);
  }
  if (canImport && needsCount > 0) {
    noteLines.push(
      `You can still import the ${readyCount} ready ${plural(readyCount, "row", "rows")} now, or go back and fix the ${needsCount} that ${plural(needsCount, "needs", "need")} fixing first.`,
    );
  }

  const trackList = model.untrackedTickers;
  const trackShown = trackList.slice(0, 10).join(", ");
  const trackMore = trackList.length > 10 ? ` and ${trackList.length - 10} more` : "";

  const skippedGroups = groupByReason(model.skipped);
  const bigReasons = skippedGroups.filter((g) => g.items.length >= 5);
  const smallItems = skippedGroups
    .filter((g) => g.items.length < 5)
    .flatMap((g) => g.items)
    .sort((a, b) => a.line - b.line);

  const left = (
    <div className="space-y-4">
      {upToDate ? (
        <div className="space-y-3 rounded-lg border border-green-600/50 p-4">
          <p className="flex items-center gap-2 text-base font-medium text-green-700 dark:text-green-400">
            <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
            You&apos;re already up to date.
          </p>
          <p className="text-sm">
            {skippedCount > 0
              ? "Every row we could import is already in your portfolio, so there is nothing to add."
              : "Every row in this file is already in your portfolio, so there is nothing to add."}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" size="lg" onClick={onImportAnother}>
              Import another file
            </Button>
            <Button size="lg" asChild>
              <Link href="/portfolio">Go to Portfolio</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-base font-medium">{summarySentence(model)}</p>
          {readyCount === 0 && totalFound > 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Check that you chose the right broker and date range.
            </p>
          ) : null}
        </div>
      )}

      {model.tooMany ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">That&apos;s a lot of rows</AlertTitle>
          <AlertDescription>
            <p>
              You can import up to 2,000 transactions at a time. Split the file by date and
              import the parts one after another.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        {model.ignoredLines > 0 ? (
          <QuietLine>
            Ignored {model.ignoredLines} summary or section{" "}
            {plural(model.ignoredLines, "line", "lines")} that{" "}
            {plural(model.ignoredLines, "is", "are")} not{" "}
            {plural(model.ignoredLines, "a transaction", "transactions")}.
          </QuietLine>
        ) : null}
        {model.absorbedLines > 0 ? (
          <QuietLine>
            {model.absorbedLines} tax {plural(model.absorbedLines, "line was", "lines were")}{" "}
            added to the matching {plural(model.absorbedLines, "dividend", "dividends")}.
          </QuietLine>
        ) : null}
        {model.accountCount > 1 ? (
          <QuietLine>
            This file has {model.accountCount} accounts. They will all go into your one
            portfolio.
          </QuietLine>
        ) : null}
        {model.currencyLabel ? (
          <QuietLine>Amounts were read as {model.currencyLabel}.</QuietLine>
        ) : null}
      </div>

      <div className="space-y-3">
        {plainReady.length > 0 ? (
          <Group tone="success" icon={CircleCheck} title="Ready to import" count={plainReady.length} defaultOpen>
            {model.anyDerivedPrice ? (
              <QuietLine>
                Prices for eToro are worked out from the amount and the number of units.
              </QuietLine>
            ) : null}
            <Limited items={plainReady}>{(rows) => <TradeRows rows={rows} />}</Limited>
          </Group>
        ) : null}

        {needsCount > 0 ? (
          <Group tone="destructive" icon={TriangleAlert} title="Needs fixing" count={needsCount} defaultOpen>
            {trackList.length > 0 ? (
              <Alert>
                <Info aria-hidden="true" />
                <AlertTitle className="line-clamp-none font-bold">
                  Track these first: {trackShown}
                  {trackMore}
                </AlertTitle>
                <AlertDescription>
                  <p>Add them on the Stocks page, then come back and check the file again.</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Button variant="outline" size="lg" asChild>
                      <Link href="/stocks" target="_blank" rel="noopener noreferrer">
                        Track a stock
                      </Link>
                    </Button>
                    <Button type="button" variant="outline" size="lg" onClick={onRecheck} disabled={busy}>
                      {isRechecking ? (
                        <>
                          <LoaderCircle className="animate-spin" aria-hidden="true" />
                          Updating your list...
                        </>
                      ) : (
                        "Go back and check again"
                      )}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}
            <p className="text-sm">
              These rows should have been importable, but something is wrong with them. Fix
              them in your file and try again, or import the ready rows now.
            </p>
            <Limited items={model.needs}>
              {(items) => <NeedRows items={items} showFile={showFile} />}
            </Limited>
          </Group>
        ) : null}

        {skippedCount > 0 ? (
          <Group
            tone="warning"
            icon={SkipForward}
            title="Skipped"
            count={skippedCount}
            defaultOpen={skippedCount <= 3}
          >
            <p className="text-sm font-medium">
              We left these out on purpose instead of guessing. Nothing from them will be
              imported.
            </p>
            {bigReasons.map((g) => (
              <div key={g.reason}>
                <h4 className="text-sm font-semibold">
                  {g.reason} ({g.items.length} rows)
                </h4>
                <Limited items={g.items}>
                  {(items) => <SkippedRows items={items} showFile={showFile} />}
                </Limited>
              </div>
            ))}
            {smallItems.length > 0 ? (
              <Limited items={smallItems}>
                {(items) => <SkippedRows items={items} showFile={showFile} />}
              </Limited>
            ) : null}
          </Group>
        ) : null}

        {alreadyCount > 0 ? (
          <Group tone="default" icon={History} title="Already imported" count={alreadyCount} defaultOpen={false}>
            <p className="text-sm">
              These are already in your portfolio, so we won&apos;t add them again.
            </p>
            <Limited items={model.already}>{(rows) => <TradeRows rows={rows} />}</Limited>
          </Group>
        ) : null}

        {noted.length > 0 ? (
          <Group tone="warning" icon={Info} title="Imported with a note" count={noted.length} defaultOpen>
            <p className="text-sm">
              These will be imported (they are counted in the ready total), but please read
              the note.
            </p>
            <Limited items={noted}>
              {(rows) => <TradeRows rows={rows} showRowNumber showFile={showFile} />}
            </Limited>
          </Group>
        ) : null}
      </div>
    </div>
  );

  const counts: { label: string; value: number; ready?: boolean }[] = [
    { label: "Ready", value: readyCount, ready: true },
    { label: "Needs fixing", value: needsCount },
    { label: "Skipped", value: skippedCount },
    { label: "Already imported", value: alreadyCount },
    { label: "Imported with a note", value: noted.length },
  ];

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-medium">Check your file</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Nothing has been saved yet.</p>
      </div>

      <div className={cn(upToDate ? null : "lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8")}>
        {left}

        {upToDate ? null : (
          <aside className="hidden lg:block">
            <Card className="sticky top-6 gap-4 p-5">
              <dl className="space-y-2">
                {counts.map((c) => (
                  <div key={c.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-sm">
                      {c.ready ? (
                        <span className="text-green-700 dark:text-green-400">{c.label}</span>
                      ) : (
                        c.label
                      )}
                    </dt>
                    <dd
                      className={cn(
                        "text-right tabular-nums",
                        c.ready ? "text-2xl font-semibold" : "text-sm font-medium",
                      )}
                    >
                      {c.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {importButton ? <div className="[&>button]:w-full">{importButton}</div> : null}
              <Button type="button" variant="ghost" size="lg" onClick={onBack} disabled={busy}>
                Back
              </Button>
              {noteLines.map((line, i) => (
                <p key={i} className="text-xs text-slate-500 dark:text-slate-400">
                  {line}
                </p>
              ))}
            </Card>
          </aside>
        )}
      </div>

      {upToDate ? null : (
        <StickyActions className="lg:hidden">
          <Button type="button" variant="ghost" size="lg" onClick={onBack} disabled={busy}>
            Back
          </Button>
          {importButton}
          {noteLines.map((line, i) => (
            <p key={i} className="text-xs text-slate-500 dark:text-slate-400">
              {line}
            </p>
          ))}
        </StickyActions>
      )}
    </div>
  );
}

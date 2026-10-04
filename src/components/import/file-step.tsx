"use client";

// Screen 2: "Get your file" (UI spec section 3). Numbered steps for the chosen
// broker, the upload / paste tabs, the drop zone, the file list for brokers
// whose files cover a limited date range, and every friendly message (Excel,
// too big, not a CSV, wrong broker). The file is read in the browser only.

import * as React from "react";
import Link from "next/link";
import {
  CircleCheck,
  Download,
  FileSpreadsheet,
  Info,
  Link2,
  LoaderCircle,
  Plus,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

import {
  checkUploadedFile,
  getPresetCard,
  PRESET_CARDS,
  type PresetId,
} from "@/lib/import-presets";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { StickyActions } from "./sticky-actions";

export type PickedFile = {
  id: string;
  name: string;
  size: number;
  text: string;
  /** Set when this file was refused as the wrong broker's. */
  problem?: string;
};

/** One message at a time above the drop zone. */
export type FileNotice =
  | {
      kind: "problem";
      variant: "warning" | "destructive";
      icon: "excel" | "alert";
      title: string;
      lines: string[];
    }
  | {
      kind: "wrong";
      title: string;
      lines: string[];
      suggested?: { id: PresetId; name: string };
    };

const OTHER_PLACEHOLDER =
  "ticker,market,type,trade_date,quantity,price_per_unit,amount,currency,fee,note";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const BETA_TEXT =
  "We built this from the broker's help pages and haven't tried it on a real file yet. If a line doesn't look right, InvestIQ skips it instead of guessing.";

const TEMPLATE_EXAMPLE: { label: string; rows: string[][] } = {
  label: "Date,Ticker,Type,Quantity,Price",
  rows: [
    ["2026-01-12", "BKMB", "Buy", "500", "0.305"],
    ["2026-04-02", "BKMB", "Sell", "200", "0.320"],
  ],
};
const TEMPLATE_HEADERS = ["Date", "Ticker", "Type", "Quantity", "Price"];

export function FileStep({
  choice,
  brokerLink = null,
  tab,
  onTabChange,
  pasteText,
  onPasteChange,
  files,
  onAddFiles,
  onRemoveFile,
  notice,
  onNotice,
  isChecking,
  continueDisabled,
  onContinue,
  onBack,
  onSwitchPreset,
  onChooseAnother,
}: {
  choice: PresetId | "other";
  /** Offer "Connect instead" (Interactive Brokers screen only); null hides it. */
  brokerLink?: "pro" | "available" | null;
  tab: string;
  onTabChange: (tab: string) => void;
  pasteText: string;
  onPasteChange: (text: string) => void;
  files: PickedFile[];
  onAddFiles: (files: PickedFile[]) => void;
  onRemoveFile: (id: string) => void;
  notice: FileNotice | null;
  onNotice: (notice: FileNotice | null) => void;
  isChecking: boolean;
  continueDisabled: boolean;
  onContinue: () => void;
  onBack: () => void;
  onSwitchPreset: (id: PresetId) => void;
  onChooseAnother: () => void;
}) {
  const card = getPresetCard(choice);
  const isOther = choice === "other";
  const multi = card.multiFile;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [reading, setReading] = React.useState(false);

  async function handleFiles(list: File[]) {
    if (list.length === 0) return;
    const incoming = multi ? list : list.slice(0, 1);
    setReading(true);
    const accepted: PickedFile[] = [];
    let firstProblem: FileNotice | null = null;
    for (const file of incoming) {
      let head: Uint8Array | undefined;
      try {
        head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      } catch {
        head = undefined;
      }
      const check = checkUploadedFile({ name: file.name, size: file.size, head }, choice);
      if (!check.ok) {
        firstProblem ??= {
          kind: "problem",
          variant: check.kind === "excel" ? "warning" : "destructive",
          icon: check.kind === "excel" ? "excel" : "alert",
          title: check.title,
          lines: check.extra ? [check.message, check.extra] : [check.message],
        };
        continue;
      }
      try {
        accepted.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          name: file.name,
          size: file.size,
          text: await file.text(),
        });
      } catch {
        firstProblem ??= {
          kind: "problem",
          variant: "destructive",
          icon: "alert",
          title: "We can't read that kind of file",
          lines: ["Please choose a .csv file. Excel files (.xlsx) need to be saved as CSV first."],
        };
      }
    }
    setReading(false);
    if (accepted.length > 0) onAddFiles(accepted);
    onNotice(firstProblem);
  }

  const shortZoneError =
    notice?.kind === "problem" && notice.variant === "destructive"
      ? "Only .csv files, up to 5 MB"
      : null;

  const placeholder = isOther ? OTHER_PLACEHOLDER : (card.headerExample ?? OTHER_PLACEHOLDER);
  const showBeta = card.beta || !!card.betaDetail;

  // ----- left column: read-this -------------------------------------------
  const left = isOther ? (
    <div>
      <Button variant="link" size="lg" className="px-0" asChild>
        <a href="/sample-transactions.csv" download>
          <Download aria-hidden="true" />
          Download sample CSV
        </a>
      </Button>
    </div>
  ) : (
    <div className="space-y-4">
      <h3 className="text-base font-medium">How to get this file from {card.name}</h3>
      <ol className="space-y-3">
        {card.steps.map((step, index) => (
          <li key={index} className="flex gap-3 text-sm">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      {showBeta ? (
        <Alert>
          <Info aria-hidden="true" />
          <AlertTitle>Beta</AlertTitle>
          <AlertDescription>
            <p>{card.beta ? BETA_TEXT : card.betaDetail}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {card.fixedCurrencyNote ? (
        <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {card.fixedCurrencyNote}
        </p>
      ) : null}

      {brokerLink ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          <Link
            href="/settings#broker-connection"
            className="inline-flex min-h-11 items-center gap-2 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Link2 className="size-4 shrink-0" aria-hidden="true" />
            {brokerLink === "pro"
              ? "Want this automatic? Connect Interactive Brokers instead (Pro)"
              : "Want this automatic? Connect Interactive Brokers instead"}
          </Link>
        </p>
      ) : null}

      {card.templateDownload ? (
        <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <Button variant="outline" size="lg" asChild>
            <a href={card.templateDownload} download>
              <Download aria-hidden="true" />
              Download the template
            </a>
          </Button>
          <p className="text-sm">
            Fill in one row per trade. Dates must look like 2026-03-14.
          </p>
          {/* Phone: stacked "label: value" rows. Wider: a real table. */}
          <div className="space-y-2 lg:hidden">
            {TEMPLATE_EXAMPLE.rows.map((row, index) => (
              <dl
                key={index}
                className="rounded-md bg-slate-50 p-3 text-xs dark:bg-slate-900"
              >
                {TEMPLATE_HEADERS.map((header, i) => (
                  <div key={header} className="flex gap-2">
                    <dt className="w-20 shrink-0 text-slate-500 dark:text-slate-400">
                      {header}:
                    </dt>
                    <dd className="font-mono">{row[i]}</dd>
                  </div>
                ))}
              </dl>
            ))}
          </div>
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {TEMPLATE_HEADERS.map((header) => (
                    <TableHead key={header}>{header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {TEMPLATE_EXAMPLE.rows.map((row, index) => (
                  <TableRow key={index}>
                    {row.map((cell, i) => (
                      <TableCell key={i} className="font-mono text-xs">
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Not sure a broker is supported? Use this template. It works for any broker.
          </p>
        </div>
      ) : null}
    </div>
  );

  // ----- right column: the file --------------------------------------------
  const hasFile = files.length > 0;
  const right = (
    <div className="space-y-4">
      {notice ? <NoticeAlert notice={notice} onSwitch={onSwitchPreset} onChooseAnother={() => {
        onChooseAnother();
        inputRef.current?.click();
      }} onPickBroker={onBack} /> : null}

      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="upload">Upload file</TabsTrigger>
          <TabsTrigger value="paste">Paste text</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-4 space-y-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void handleFiles(Array.from(event.dataTransfer.files));
            }}
            className={cn(
              "flex min-h-[160px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring lg:min-h-[220px]",
              dragging
                ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950"
                : shortZoneError
                  ? "border-red-600 dark:border-red-500"
                  : "border-slate-300 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600",
            )}
          >
            {reading ? (
              <>
                <LoaderCircle className="size-6 animate-spin text-slate-400" aria-hidden="true" />
                <span className="text-sm text-slate-600 dark:text-slate-400">Reading your file...</span>
              </>
            ) : dragging ? (
              <>
                <Upload className="size-6 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <span className="text-sm font-medium">Drop to add it</span>
              </>
            ) : hasFile && !multi ? (
              <>
                <CircleCheck className="size-6 text-green-600 dark:text-green-400" aria-hidden="true" />
                <span className="max-w-full truncate text-sm font-medium">{files[0].name}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Ready. Choose another file to replace it.
                </span>
              </>
            ) : (
              <>
                <Upload className="size-6 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  <span className="md:hidden">Tap to choose your file</span>
                  <span className="hidden md:inline">Drag your file here, or click to choose</span>
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  CSV file, up to 5 MB each.
                </span>
              </>
            )}
            {shortZoneError ? (
              <span className="text-xs text-red-600 dark:text-red-400">{shortZoneError}</span>
            ) : null}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,.xlsx,.xls"
            multiple={multi}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose your file"
            onChange={(event) => {
              void handleFiles(Array.from(event.target.files ?? []));
              // Allow choosing the same file again after a fix.
              event.target.value = "";
            }}
          />

          {multi && hasFile ? (
            <div className="space-y-3">
              <ul className="space-y-2">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className={cn(
                      "flex min-h-[56px] items-center gap-3 rounded-lg border px-3 py-2",
                      file.problem
                        ? "border-red-600 dark:border-red-500"
                        : "border-slate-200 dark:border-slate-800",
                    )}
                  >
                    <FileSpreadsheet
                      className="size-5 shrink-0 text-slate-400 dark:text-slate-500"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatSize(file.size)}
                      </p>
                      {file.problem ? (
                        <p className="text-xs text-red-600 dark:text-red-400">{file.problem}</p>
                      ) : null}
                    </div>
                    <Tooltip>
                      <TooltipTrigger tabIndex={-1}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${file.name}`}
                          onClick={() => onRemoveFile(file.id)}
                          disabled={isChecking}
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" aria-hidden="true">Remove this file</TooltipContent>
                    </Tooltip>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => inputRef.current?.click()}
                disabled={isChecking}
              >
                <Plus aria-hidden="true" />
                Add another file
              </Button>
              <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
                {files.length} {files.length === 1 ? "file" : "files"} ready
              </p>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="paste" className="mt-4">
          <Textarea
            rows={10}
            value={pasteText}
            onChange={(event) => onPasteChange(event.target.value)}
            placeholder={placeholder}
            className="font-mono text-xs break-all whitespace-pre-wrap"
            aria-label="Paste CSV text"
          />
        </TabsContent>
      </Tabs>
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="button" variant="ghost" size="lg" className="-ml-3" onClick={onBack} disabled={isChecking}>
          Back
        </Button>
        <p className="flex min-h-11 items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {isOther ? "Other, you match the columns" : card.name}
          </span>
          <button
            type="button"
            onClick={onBack}
            disabled={isChecking}
            className="flex min-h-11 items-center text-blue-600 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:text-blue-400"
          >
            Change
          </button>
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-8">
        <div className="mb-6 lg:mb-0">{isOther ? null : left}</div>
        <div>
          {isOther ? <div className="mb-2">{left}</div> : null}
          {right}
        </div>
      </div>

      <StickyActions>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={onBack}
          disabled={isChecking}
          className="order-2 lg:order-1"
        >
          Back
        </Button>
        <Button
          type="button"
          size="lg"
          disabled={continueDisabled || isChecking}
          onClick={onContinue}
          className="order-1 lg:order-2"
        >
          {isChecking ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              Checking your file...
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </StickyActions>
    </div>
  );
}

function NoticeAlert({
  notice,
  onSwitch,
  onChooseAnother,
  onPickBroker,
}: {
  notice: FileNotice;
  onSwitch: (id: PresetId) => void;
  onChooseAnother: () => void;
  onPickBroker: () => void;
}) {
  if (notice.kind === "problem") {
    return (
      <Alert variant={notice.variant}>
        {notice.icon === "excel" ? (
          <FileSpreadsheet aria-hidden="true" />
        ) : (
          <TriangleAlert aria-hidden="true" />
        )}
        <AlertTitle className="line-clamp-none">{notice.title}</AlertTitle>
        <AlertDescription>
          {notice.lines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle className="line-clamp-none">{notice.title}</AlertTitle>
      <AlertDescription>
        {notice.lines.map((line, index) => (
          <p key={index}>{line}</p>
        ))}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {notice.suggested ? (
            <Button type="button" size="lg" onClick={() => onSwitch(notice.suggested!.id)}>
              Switch to {notice.suggested.name}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="lg" onClick={onChooseAnother}>
            Choose another file
          </Button>
          {notice.suggested ? null : (
            <Button type="button" variant="link" size="lg" onClick={onPickBroker}>
              Pick a different broker
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

/** Used by the wizard to find a broker's display name. */
export function brokerName(id: PresetId): string {
  return PRESET_CARDS.find((c) => c.id === id)?.name ?? id;
}

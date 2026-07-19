"use client";

// The 4-step CSV import wizard (UI spec §3.3).
//
// Step 1 — upload a file or paste CSV text (client-side only, nothing sent).
// Step 2 — map CSV columns to transaction fields, with a 3-row preview.
// Step 3 — dry-run validation via the validateImportRows server action:
//          every problem is reported in plain English, nothing is written.
// Step 4 — the real import via importTransactions (all-or-nothing on the
//          server: one failure means nothing lands).
//
// Parsing uses the existing src/lib/csv.ts parser — never a second parser.

import * as React from "react";
import Link from "next/link";
import {
  CircleCheck,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  TriangleAlert,
  Upload,
} from "lucide-react";

import {
  importTransactions,
  validateImportRows,
  type ImportValidationReport,
  type MappedImportRow,
} from "@/app/actions/import-transactions";
import { parseCsv, type CsvData } from "@/lib/csv";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
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

// ---------------------------------------------------------------------------
// Column-mapping targets. The keys match MappedImportRow (what the server
// actions expect); the labels are what the owner sees in the mapping selects.
// ---------------------------------------------------------------------------

const IGNORE = "ignore";

const MAP_TARGETS: { key: keyof MappedImportRow; label: string }[] = [
  { key: "ticker", label: "Ticker" },
  { key: "market", label: "Market" },
  { key: "type", label: "Type" },
  { key: "quantity", label: "Quantity" },
  { key: "pricePerUnit", label: "Price per unit" },
  { key: "amount", label: "Amount" },
  { key: "currency", label: "Currency" },
  { key: "fee", label: "Fee" },
  { key: "tradeDate", label: "Trade date" },
  { key: "note", label: "Note" },
];

const MAPPING_OPTIONS = [
  ...MAP_TARGETS.map((t) => ({ value: t.key as string, label: t.label })),
  { value: IGNORE, label: "— Ignore this column —" },
];

// The sample file's exact header names (public/sample-transactions.csv),
// matched case-insensitively to pre-fill the mapping. Anything unrecognized
// starts as "ignore" and stays user-editable.
const HEADER_GUESSES: Record<string, keyof MappedImportRow> = {
  ticker: "ticker",
  market: "market",
  type: "type",
  trade_date: "tradeDate",
  quantity: "quantity",
  price_per_unit: "pricePerUnit",
  amount: "amount",
  currency: "currency",
  fee: "fee",
  note: "note",
};

function guessMapping(headers: string[]): string[] {
  return headers.map((header) => HEADER_GUESSES[header.trim().toLowerCase()] ?? IGNORE);
}

/** Apply the chosen mapping to every data row (raw strings, no conversion). */
function buildMappedRows(csv: CsvData, mapping: string[]): MappedImportRow[] {
  return csv.rows.map((cells) => {
    const row: Record<string, string> = {};
    mapping.forEach((target, index) => {
      if (target === IGNORE) return;
      const value = cells[index];
      if (value !== undefined) row[target] = value;
    });
    return row as MappedImportRow;
  });
}

const STEP_NAMES: Record<number, string> = {
  1: "Upload or paste",
  2: "Column mapping",
  3: "Validation",
  4: "Import",
};

type ImportOutcome =
  | { ok: true; imported: number }
  | { ok: false; message: string };

export function ImportWizard() {
  const [step, setStep] = React.useState<1 | 2 | 3 | 4>(1);

  // Step 1 state.
  const [tab, setTab] = React.useState("upload");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [fileText, setFileText] = React.useState<string | null>(null);
  const [pasteText, setPasteText] = React.useState("");
  const [stepOneError, setStepOneError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Steps 2–4 state.
  const [csv, setCsv] = React.useState<CsvData | null>(null);
  const [mapping, setMapping] = React.useState<string[]>([]);
  const [mappedRows, setMappedRows] = React.useState<MappedImportRow[]>([]);
  const [report, setReport] = React.useState<ImportValidationReport | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<ImportOutcome | null>(null);
  const [isValidating, startValidating] = React.useTransition();
  const [isImporting, startImporting] = React.useTransition();

  // ----- Step 1: choose a file or paste text --------------------------------

  function readFile(file: File) {
    const looksLikeCsv =
      file.name.toLowerCase().endsWith(".csv") || file.type.includes("csv");
    if (!looksLikeCsv) {
      setStepOneError("That doesn't look like a CSV file — choose a .csv file.");
      return;
    }
    file.text().then((text) => {
      setFileName(file.name);
      setFileText(text);
      setStepOneError(null);
    });
  }

  function continueFromStepOne() {
    const text = tab === "upload" ? (fileText ?? "") : pasteText;
    const parsed = parseCsv(text);
    if (!parsed.ok) {
      setStepOneError(parsed.error.message);
      return;
    }
    if (parsed.data.rows.length === 0) {
      setStepOneError(
        "That CSV only has a header row — there are no data rows to import.",
      );
      return;
    }
    setStepOneError(null);
    setCsv(parsed.data);
    setMapping(guessMapping(parsed.data.headers));
    setStep(2);
  }

  const continueDisabled =
    tab === "upload" ? fileText === null : pasteText.trim().length === 0;

  // ----- Step 2: column mapping ---------------------------------------------

  // Two CSV columns mapped to the same field would silently overwrite each
  // other, so validation is blocked until the duplicate is resolved.
  const duplicateTargets = React.useMemo(() => {
    const seen = new Map<string, number>();
    for (const target of mapping) {
      if (target === IGNORE) continue;
      seen.set(target, (seen.get(target) ?? 0) + 1);
    }
    return MAP_TARGETS.filter((t) => (seen.get(t.key) ?? 0) > 1).map((t) => t.label);
  }, [mapping]);

  function validate() {
    if (!csv) return;
    const rows = buildMappedRows(csv, mapping);
    setMappedRows(rows);
    setActionError(null);
    startValidating(async () => {
      const result = await validateImportRows(rows);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setReport(result.data);
      setStep(3);
    });
  }

  // ----- Step 3 → 4: the real import ----------------------------------------

  function runImport() {
    if (!report) return;
    // Only the rows that passed the dry run are sent — the server would
    // (rightly) refuse the whole batch if any bad row were included.
    const okRowNumbers = new Set(
      report.results.filter((r) => r.ok).map((r) => r.row),
    );
    const validRows = mappedRows.filter((_, index) => okRowNumbers.has(index + 1));
    setActionError(null);
    startImporting(async () => {
      const result = await importTransactions(validRows);
      setOutcome(
        result.ok
          ? { ok: true, imported: result.data.imported }
          : { ok: false, message: result.error },
      );
      setStep(4);
    });
  }

  // ----- Render -------------------------------------------------------------

  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Step {step} of 4 — {STEP_NAMES[step]}
      </p>

      {actionError ? (
        <Alert variant="destructive" className="mb-4">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            <p>{actionError}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          {step === 1 ? (
            <StepOne
              tab={tab}
              onTabChange={setTab}
              fileName={fileName}
              onFileChosen={readFile}
              fileInputRef={fileInputRef}
              pasteText={pasteText}
              onPasteTextChange={setPasteText}
              error={stepOneError}
              continueDisabled={continueDisabled}
              onContinue={continueFromStepOne}
            />
          ) : null}

          {step === 2 && csv ? (
            <StepTwo
              csv={csv}
              mapping={mapping}
              onMappingChange={setMapping}
              duplicateTargets={duplicateTargets}
              isValidating={isValidating}
              onBack={() => setStep(1)}
              onValidate={validate}
            />
          ) : null}

          {step === 3 && csv && report ? (
            <StepThree
              csv={csv}
              report={report}
              isImporting={isImporting}
              onBack={() => setStep(2)}
              onImport={runImport}
            />
          ) : null}

          {step === 4 && outcome ? (
            <StepFour
              outcome={outcome}
              onTryAgain={() => {
                // Back to the dry-run results without re-uploading anything.
                setOutcome(null);
                setStep(3);
              }}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — upload or paste
// ---------------------------------------------------------------------------

function StepOne({
  tab,
  onTabChange,
  fileName,
  onFileChosen,
  fileInputRef,
  pasteText,
  onPasteTextChange,
  error,
  continueDisabled,
  onContinue,
}: {
  tab: string;
  onTabChange: (tab: string) => void;
  fileName: string | null;
  onFileChosen: (file: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  pasteText: string;
  onPasteTextChange: (text: string) => void;
  error: string | null;
  continueDisabled: boolean;
  onContinue: () => void;
}) {
  return (
    <div>
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>That CSV couldn&apos;t be read</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="upload">Upload file</TabsTrigger>
          <TabsTrigger value="paste">Paste text</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          {/* Drop zone wrapping a hidden native file input. */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file) onFileChosen(file);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-8 text-center outline-none transition-colors hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-ring dark:border-slate-700 dark:hover:border-slate-600"
          >
            {fileName ? (
              <>
                <FileSpreadsheet
                  className="size-6 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                />
                <span className="text-sm font-medium">{fileName}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Ready — or drop a different file to replace it.
                </span>
              </>
            ) : (
              <>
                <Upload
                  className="size-6 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Drag a CSV file here or click to choose
                </span>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileChosen(file);
              // Allow re-choosing the same file after a fix.
              event.target.value = "";
            }}
          />
        </TabsContent>

        <TabsContent value="paste">
          <Textarea
            rows={10}
            value={pasteText}
            onChange={(event) => onPasteTextChange(event.target.value)}
            placeholder="ticker,market,type,trade_date,quantity,price_per_unit,amount,currency,fee,note"
            className="font-mono text-xs"
            aria-label="Paste CSV text"
          />
        </TabsContent>
      </Tabs>

      <div className="mt-4">
        <Button variant="link" size="sm" className="px-0" asChild>
          <a href="/sample-transactions.csv" download>
            <Download aria-hidden="true" />
            Download sample CSV
          </a>
        </Button>
      </div>

      <div className="mt-4 flex justify-end">
        <Button type="button" disabled={continueDisabled} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — column mapping + preview of the first rows
// ---------------------------------------------------------------------------

function StepTwo({
  csv,
  mapping,
  onMappingChange,
  duplicateTargets,
  isValidating,
  onBack,
  onValidate,
}: {
  csv: CsvData;
  mapping: string[];
  onMappingChange: (mapping: string[]) => void;
  duplicateTargets: string[];
  isValidating: boolean;
  onBack: () => void;
  onValidate: () => void;
}) {
  const previewRows = csv.rows.slice(0, 3);

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>CSV Column</TableHead>
            <TableHead>Maps to</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {csv.headers.map((header, index) => (
            <TableRow key={`${header}-${index}`}>
              <TableCell className="font-mono text-xs">{header || "(unnamed column)"}</TableCell>
              <TableCell>
                <Select
                  value={mapping[index]}
                  onValueChange={(value) => {
                    const next = [...mapping];
                    next[index] = value;
                    onMappingChange(next);
                  }}
                  options={MAPPING_OPTIONS}
                  className="max-w-56"
                  aria-label={`Map column ${header || index + 1}`}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {duplicateTargets.length > 0 ? (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          More than one column is mapped to{" "}
          {duplicateTargets.join(" and ")} — map one of them to something else
          or ignore it before validating.
        </p>
      ) : null}

      <h3 className="mt-6 mb-2 text-sm font-semibold">
        Preview — first {previewRows.length} row{previewRows.length === 1 ? "" : "s"}
      </h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {csv.headers.map((header, index) => (
                <TableHead key={`${header}-${index}`} className="font-mono text-xs">
                  {header || "(unnamed)"}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {previewRows.map((cells, rowIndex) => (
              <TableRow key={rowIndex}>
                {csv.headers.map((_, cellIndex) => (
                  <TableCell key={cellIndex} className="font-mono text-xs">
                    {cells[cellIndex] ?? ""}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onBack} disabled={isValidating}>
          Back
        </Button>
        <Button
          type="button"
          onClick={onValidate}
          disabled={isValidating || duplicateTargets.length > 0}
        >
          {isValidating ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              Validating…
            </>
          ) : (
            "Validate"
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — dry-run validation results (nothing written yet)
// ---------------------------------------------------------------------------

function StepThree({
  csv,
  report,
  isImporting,
  onBack,
  onImport,
}: {
  csv: CsvData;
  report: ImportValidationReport;
  isImporting: boolean;
  onBack: () => void;
  onImport: () => void;
}) {
  const errored = report.results.filter((r) => !r.ok);
  const importCount = report.validCount;
  const importLabel = `Import ${importCount} transaction${importCount === 1 ? "" : "s"}`;

  return (
    <div>
      <p className="text-sm">
        <span className="font-semibold">
          {report.validCount} of {report.total} row{report.total === 1 ? "" : "s"} are
          ready to import.
        </span>
      </p>

      {errored.length > 0 ? (
        <>
          <h3 className="mt-4 mb-2 text-sm font-semibold">Rows with errors</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Row #</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Raw row data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errored.map((result) =>
                  result.ok ? null : (
                    <TableRow key={result.row}>
                      <TableCell className="tabular-nums">{result.row}</TableCell>
                      <TableCell>
                        {result.issues.map((issue, index) => (
                          <p key={index} className="text-sm">
                            {issue}
                          </p>
                        ))}
                      </TableCell>
                      <TableCell>
                        <p className="max-w-56 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                          {csv.rows[result.row - 1]?.join(", ") ?? ""}
                        </p>
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}

      <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
        {report.validCount === 0
          ? "No rows could be imported. Fix the issues above and try again."
          : errored.length > 0
            ? `You can still import the ${report.validCount} valid row${report.validCount === 1 ? "" : "s"} now, or go back and fix the ${errored.length} errored row${errored.length === 1 ? "" : "s"} first.`
            : report.total === 1
              ? "The 1 row looks good."
              : `All ${report.total} rows look good.`}
      </p>

      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onBack} disabled={isImporting}>
          Back
        </Button>
        {report.validCount > 0 ? (
          <Button type="button" onClick={onImport} disabled={isImporting}>
            {isImporting ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Importing…
              </>
            ) : (
              importLabel
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — the result of the real import
// ---------------------------------------------------------------------------

function StepFour({
  outcome,
  onTryAgain,
}: {
  outcome: ImportOutcome;
  onTryAgain: () => void;
}) {
  if (outcome.ok) {
    return (
      <Alert variant="success">
        <CircleCheck aria-hidden="true" />
        <AlertTitle>Import complete</AlertTitle>
        <AlertDescription>
          <p>
            {outcome.imported} transaction{outcome.imported === 1 ? " was" : "s were"}{" "}
            added to your portfolio.
          </p>
          <Button className="mt-2" asChild>
            <Link href="/portfolio">Go to Portfolio</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Import failed</AlertTitle>
      <AlertDescription>
        <p>
          Something went wrong saving these transactions. Nothing was imported —
          you can try again.
        </p>
        <p>{outcome.message}</p>
        <Button type="button" variant="outline" className="mt-2" onClick={onTryAgain}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

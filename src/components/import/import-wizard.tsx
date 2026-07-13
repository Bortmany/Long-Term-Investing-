"use client";

// The 4-step CSV import wizard for /portfolio/import.
//
//   Step 1 — upload a .csv file or paste CSV text
//   Step 2 — map CSV columns to transaction fields, preview the first rows
//   Step 3 — dry-run validation via the server (NOTHING is written)
//   Step 4 — the actual import (all-or-nothing on the server) and its result
//
// The CSV is parsed with the shared parser in src/lib/csv.ts and rows are
// checked by the validateImportRows server action — the same validation the
// real import re-runs server-side, so what Step 3 says is what Step 4 does.

import * as React from "react";
import Link from "next/link";
import { CircleCheck, Download, LoaderCircle, Upload } from "lucide-react";

import {
  importTransactions,
  validateImportRows,
  type ImportValidationReport,
  type MappedImportRow,
} from "@/app/actions/import-transactions";
import { parseCsv, type CsvData } from "@/lib/csv";
import {
  buildMappedRows,
  guessMapping,
  IMPORT_FIELDS,
  type ColumnMapping,
} from "@/components/import/mapping";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, type SelectOption } from "@/components/ui/select";
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

type Step = 1 | 2 | 3 | 4;

const STEP_NAMES: Record<Step, string> = {
  1: "Upload or paste",
  2: "Column mapping",
  3: "Dry-run validation",
  4: "Import",
};

/** The "Maps to" options: every transaction field plus "ignore". */
const MAPPING_OPTIONS: SelectOption[] = [
  ...IMPORT_FIELDS.map((field) => ({ value: field.key, label: field.label })),
  { value: "ignore", label: "— Ignore this column —" },
];

/** What Step 4 ended with: the import either fully landed or fully didn't. */
type ImportOutcome =
  | { ok: true; imported: number }
  | { ok: false; message: string | null };

export function ImportWizard() {
  const [step, setStep] = React.useState<Step>(1);

  // Step 1 state — the two input tabs.
  const [tab, setTab] = React.useState("upload");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [fileText, setFileText] = React.useState("");
  const [pasteText, setPasteText] = React.useState("");

  // Steps 2–4 state.
  const [csv, setCsv] = React.useState<CsvData | null>(null);
  const [mapping, setMapping] = React.useState<ColumnMapping[]>([]);
  const [mappedRows, setMappedRows] = React.useState<MappedImportRow[]>([]);
  const [report, setReport] = React.useState<ImportValidationReport | null>(null);
  const [outcome, setOutcome] = React.useState<ImportOutcome | null>(null);

  // In-flight flags and the current step's error message (shown as-is).
  const [validating, setValidating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [stepError, setStepError] = React.useState<string | null>(null);

  const activeText = tab === "upload" ? fileText : pasteText;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileText(await file.text());
    setStepError(null);
  }

  function handleContinue() {
    const parsed = parseCsv(activeText);
    if (!parsed.ok) {
      setStepError(parsed.error.message);
      return;
    }
    if (parsed.data.rows.length === 0) {
      setStepError(
        "That CSV only has a header row — there are no data rows to import.",
      );
      return;
    }
    setCsv(parsed.data);
    setMapping(guessMapping(parsed.data.headers));
    setStepError(null);
    setStep(2);
  }

  async function handleValidate() {
    if (!csv) return;
    const rows = buildMappedRows(csv.rows, mapping);
    setValidating(true);
    setStepError(null);
    try {
      // Dry run on the server — nothing is written to the database here.
      const result = await validateImportRows(rows);
      if (!result.ok) {
        setStepError(result.error);
        return;
      }
      setMappedRows(rows);
      setReport(result.data);
      setStep(3);
    } catch {
      setStepError("Something went wrong checking the rows. Please try again.");
    } finally {
      setValidating(false);
    }
  }

  async function handleImport() {
    if (!report) return;
    // Only the rows the dry run marked valid are sent — the server
    // re-validates them and writes all of them or none of them.
    const validRows = report.results
      .filter((result) => result.ok)
      .map((result) => mappedRows[result.row - 1]);
    setImporting(true);
    try {
      const result = await importTransactions(validRows);
      setOutcome(
        result.ok
          ? { ok: true, imported: result.data.imported }
          : { ok: false, message: result.error },
      );
    } catch {
      setOutcome({ ok: false, message: null });
    } finally {
      setImporting(false);
      setStep(4);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Import Transactions</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500 dark:text-slate-400">
        Step {step} of 4 — {STEP_NAMES[step]}
      </p>

      {stepError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{stepError}</AlertDescription>
        </Alert>
      ) : null}

      {step === 1 ? (
        <StepUpload
          tab={tab}
          onTabChange={setTab}
          fileName={fileName}
          onFileChange={handleFileChange}
          pasteText={pasteText}
          onPasteChange={setPasteText}
          canContinue={activeText.trim().length > 0}
          onContinue={handleContinue}
        />
      ) : null}

      {step === 2 && csv ? (
        <StepMapping
          csv={csv}
          mapping={mapping}
          onMappingChange={setMapping}
          validating={validating}
          onBack={() => {
            setStepError(null);
            setStep(1);
          }}
          onValidate={handleValidate}
        />
      ) : null}

      {step === 3 && report && csv ? (
        <StepValidation
          report={report}
          csv={csv}
          importing={importing}
          onBack={() => {
            setStepError(null);
            setStep(2);
          }}
          onImport={handleImport}
        />
      ) : null}

      {step === 4 && outcome ? (
        <StepResult
          outcome={outcome}
          onTryAgain={() => {
            // Back to Step 3 with everything still in memory — no re-upload.
            setOutcome(null);
            setStep(3);
          }}
        />
      ) : null}
    </>
  );
}

// --- Step 1: upload or paste -------------------------------------------------

function StepUpload({
  tab,
  onTabChange,
  fileName,
  onFileChange,
  pasteText,
  onPasteChange,
  canContinue,
  onContinue,
}: {
  tab: string;
  onTabChange: (tab: string) => void;
  fileName: string | null;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  pasteText: string;
  onPasteChange: (text: string) => void;
  canContinue: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="max-w-2xl">
      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="upload">Upload file</TabsTrigger>
          <TabsTrigger value="paste">Paste text</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          {/* The invisible file input covers the whole zone, so both clicking
              and dropping a file use the browser's native behavior. */}
          <label className="relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <Upload className="size-6 text-slate-400" aria-hidden="true" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Drag a CSV file here or click to choose
            </span>
            {fileName ? (
              <span className="text-sm font-medium">{fileName}</span>
            ) : null}
            <input
              type="file"
              accept=".csv"
              aria-label="Choose a CSV file"
              onChange={onFileChange}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </TabsContent>

        <TabsContent value="paste">
          <Textarea
            rows={10}
            value={pasteText}
            onChange={(event) => onPasteChange(event.target.value)}
            placeholder={
              "ticker,market,type,trade_date,quantity,price_per_unit,amount,currency,fee,note"
            }
            aria-label="Paste CSV text"
            className="font-mono text-xs"
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

      <div className="mt-6">
        <Button onClick={onContinue} disabled={!canContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}

// --- Step 2: column mapping + preview ----------------------------------------

function StepMapping({
  csv,
  mapping,
  onMappingChange,
  validating,
  onBack,
  onValidate,
}: {
  csv: CsvData;
  mapping: ColumnMapping[];
  onMappingChange: (mapping: ColumnMapping[]) => void;
  validating: boolean;
  onBack: () => void;
  onValidate: () => void;
}) {
  const previewRows = csv.rows.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>CSV Column</TableHead>
              <TableHead>Maps to</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {csv.headers.map((header, columnIndex) => (
              <TableRow key={columnIndex}>
                <TableCell className="font-mono">{header}</TableCell>
                <TableCell>
                  <Select
                    value={mapping[columnIndex]}
                    onValueChange={(value) => {
                      const next = [...mapping];
                      next[columnIndex] = value as ColumnMapping;
                      onMappingChange(next);
                    }}
                    options={MAPPING_OPTIONS}
                    aria-label={`Field for CSV column ${header}`}
                    className="w-56"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">
          Preview — first {previewRows.length} row
          {previewRows.length === 1 ? "" : "s"}
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              {csv.headers.map((header, index) => (
                <TableHead key={index} className="font-mono">
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {previewRows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {csv.headers.map((_, columnIndex) => (
                  <TableCell key={columnIndex} className="font-mono text-xs">
                    {row[columnIndex] ?? ""}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={validating}>
          Back
        </Button>
        <Button onClick={onValidate} disabled={validating}>
          {validating ? (
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

// --- Step 3: dry-run results --------------------------------------------------

function StepValidation({
  report,
  csv,
  importing,
  onBack,
  onImport,
}: {
  report: ImportValidationReport;
  csv: CsvData;
  importing: boolean;
  onBack: () => void;
  onImport: () => void;
}) {
  const { validCount, errorCount, total } = report;
  const errored = report.results.filter((result) => !result.ok);

  return (
    <div className="space-y-6">
      <p className="text-base font-medium">
        {validCount} of {total} rows are ready to import.
      </p>

      {errored.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Rows with errors</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">Row #</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Raw row data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errored.map((result) => (
                <TableRow key={result.row}>
                  <TableCell className="text-right tabular-nums">
                    {result.row}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {result.ok ? null : result.issues.join(" ")}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-64 truncate font-mono text-xs">
                      {(csv.rows[result.row - 1] ?? []).join(", ")}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {validCount === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No rows could be imported. Fix the issues above and try again.
        </p>
      ) : errorCount > 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          You can still import the {validCount} valid rows now, or go back and
          fix the {errorCount} errored rows first.
        </p>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          All {total} rows look good.
        </p>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={importing}>
          Back
        </Button>
        {validCount > 0 ? (
          <Button onClick={onImport} disabled={importing}>
            {importing ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Importing…
              </>
            ) : (
              `Import ${validCount} transaction${validCount === 1 ? "" : "s"}`
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// --- Step 4: the result --------------------------------------------------------

function StepResult({
  outcome,
  onTryAgain,
}: {
  outcome: ImportOutcome;
  onTryAgain: () => void;
}) {
  if (outcome.ok) {
    return (
      <div className="max-w-2xl space-y-4">
        <Alert variant="success">
          <CircleCheck aria-hidden="true" />
          <AlertTitle>Import complete</AlertTitle>
          <AlertDescription>
            {outcome.imported} transaction{outcome.imported === 1 ? " was" : "s were"}{" "}
            added to your portfolio.
          </AlertDescription>
        </Alert>
        <Button asChild>
          <Link href="/portfolio">Go to Portfolio</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Alert variant="destructive">
        <AlertTitle>Import failed</AlertTitle>
        <AlertDescription>
          <p>
            Something went wrong saving these transactions. Nothing was
            imported — you can try again.
          </p>
          {/* The server's own plain-English explanation, when it gave one. */}
          {outcome.message ? <p>{outcome.message}</p> : null}
        </AlertDescription>
      </Alert>
      <Button variant="outline" onClick={onTryAgain}>
        Try again
      </Button>
    </div>
  );
}

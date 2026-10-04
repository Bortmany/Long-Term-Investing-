"use client";

// The import wizard (UI spec: broker-file-presets-ui.md).
//
// Preset path (4 steps):  Broker -> Your file -> Check -> Done.
// "Other" path (5 steps): Broker -> Your file -> Match columns -> Check -> Done.
//
// Everything about the file is read in the browser: the chosen broker's preset
// (src/lib/import-presets) turns the file into rows, sorts them into ready /
// needs fixing / skipped / already imported, and only the ready rows are ever
// sent to the server. Nothing is saved until the person presses Import. The
// server re-checks every row itself (client results are never trusted) and the
// import is all-or-nothing.
//
// Golden rule: no figure is invented here. A row that is not understood is
// listed with its reason; it is never repaired or guessed.
//
// Client-component rule: this file and its helpers import only TYPES and pure
// modules, never prisma or other server code. The server actions are called,
// not imported for their internals (see the warning in import-transactions.ts).

import * as React from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import {
  getKnownImportReferences,
  importTransactions,
  validateImportRows,
} from "@/app/actions/import-transactions";
import { assignFingerprintReferences, type ImportValidationReport } from "@/lib/import-rows";
import { parseCsv, type CsvData } from "@/lib/csv";
import {
  getPresetCard,
  prepareUpload,
  readBrokerFile,
  type PresetId,
  type ReadOk,
  type TrackedInstrument,
} from "@/lib/import-presets";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { BrokerGrid, type BrokerChoice } from "./broker-grid";
import {
  MAX_ROWS,
  modelFromMapped,
  modelFromPlan,
  type CheckModel,
  type MappedEntry,
} from "./check-model";
import { CheckStep } from "./check-step";
import { brokerName, FileStep, type FileNotice, type PickedFile } from "./file-step";
import { buildMappedRows, guessMapping, MapStep } from "./map-step";
import { ResultStep, type ImportOutcome } from "./result-step";

type Step = "broker" | "file" | "map" | "check" | "done";

const PRESET_STEPS: { id: Step; label: string }[] = [
  { id: "broker", label: "Broker" },
  { id: "file", label: "Your file" },
  { id: "check", label: "Check" },
  { id: "done", label: "Done" },
];
const OTHER_STEPS: { id: Step; label: string }[] = [
  { id: "broker", label: "Broker" },
  { id: "file", label: "Your file" },
  { id: "map", label: "Match columns" },
  { id: "check", label: "Check" },
  { id: "done", label: "Done" },
];

const CHECK_FAILED = "We couldn't check your file. Please try again.";

export function ImportWizard({
  instruments,
}: {
  /** The stocks and funds InvestIQ already tracks (ticker and market). */
  instruments: TrackedInstrument[];
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("broker");
  const [choice, setChoice] = React.useState<BrokerChoice | null>(null);

  // Your-file state.
  const [tab, setTab] = React.useState("upload");
  const [files, setFiles] = React.useState<PickedFile[]>([]);
  const [pasteText, setPasteText] = React.useState("");
  const [notice, setNotice] = React.useState<FileNotice | null>(null);

  // Other-path mapping state.
  const [csv, setCsv] = React.useState<CsvData | null>(null);
  const [mapping, setMapping] = React.useState<string[]>([]);

  // Check / result state.
  const [model, setModel] = React.useState<CheckModel | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<ImportOutcome | null>(null);
  const [isChecking, startChecking] = React.useTransition();
  const [isImporting, startImporting] = React.useTransition();
  const [isRefreshing, startRefreshing] = React.useTransition();

  const isOther = choice === "other";
  const steps = isOther ? OTHER_STEPS : PRESET_STEPS;
  const stepIndex = Math.max(0, steps.findIndex((s) => s.id === step));

  // ----- Screen 1: choose a broker -----------------------------------------

  function chooseBroker(id: BrokerChoice) {
    if (id !== choice) {
      setNotice(null);
      setFiles((prev) => prev.map((f) => ({ ...f, problem: undefined })));
    }
    setChoice(id);
    setActionError(null);
    setStep("file");
  }

  // ----- Screen 2: your file -----------------------------------------------

  function addFiles(picked: PickedFile[]) {
    const multi = choice ? getPresetCard(choice).multiFile : false;
    setFiles((prev) => {
      if (!multi) return picked.slice(0, 1);
      const byId = new Map<string, PickedFile>(
        prev.map((f) => [f.id, { ...f, problem: undefined }]),
      );
      for (const f of picked) byId.set(f.id, f);
      return [...byId.values()];
    });
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setNotice(null);
  }

  function chooseAnotherFile() {
    // Take out the file(s) that did not match, then the picker opens.
    setFiles((prev) => (prev.some((f) => f.problem) ? prev.filter((f) => !f.problem) : []));
    setNotice(null);
  }

  /** Read the file(s) with a broker's preset, then check against the portfolio. */
  function runPresetCheck(presetId: PresetId) {
    const card = getPresetCard(presetId);
    const sources: { id?: string; name?: string; text: string }[] =
      tab === "paste"
        ? [{ text: pasteText }]
        : files.map((f) => ({ id: f.id, name: f.name, text: f.text }));

    setActionError(null);
    setNotice(null);

    const reads: ReadOk[] = [];
    const refused: { id?: string; name?: string; result: Extract<ReturnType<typeof readBrokerFile>, { ok: false }> }[] = [];
    for (const source of sources) {
      const result = readBrokerFile(presetId, source.text, { fileName: source.name });
      if (result.ok) reads.push(result);
      else refused.push({ id: source.id, name: source.name, result });
    }

    if (refused.length > 0) {
      const refusedIds = new Map(
        refused.filter((r) => r.id).map((r) => [r.id as string, r.result.reason]),
      );
      setFiles((prev) =>
        prev.map((f) => {
          const reason = refusedIds.get(f.id);
          return {
            ...f,
            problem: reason
              ? reason === "wrong_file"
                ? "Doesn't match"
                : "Can't be read"
              : undefined,
          };
        }),
      );
      const first = refused[0];
      const r = first.result;
      if (r.reason === "wrong_file") {
        const missing = r.missingColumns ?? [];
        const shown = missing.slice(0, 5).join(", ");
        const more = missing.length > 5 ? ` and ${missing.length - 5} more` : "";
        const lines = [
          missing.length > 0 ? `Your file is missing these columns: ${shown}${more}.` : r.message,
        ];
        const suggested = r.suggestedPreset
          ? { id: r.suggestedPreset, name: brokerName(r.suggestedPreset) }
          : undefined;
        if (suggested) lines.push(`This looks like a ${suggested.name} file.`);
        setNotice({
          kind: "wrong",
          title:
            card.multiFile && first.name
              ? `'${first.name}' doesn't look like a ${card.name} file`
              : `This doesn't look like a ${card.name} file`,
          lines,
          suggested,
        });
      } else if (r.reason === "no_rows") {
        setNotice({
          kind: "problem",
          variant: "destructive",
          icon: "alert",
          title: "That file has no transactions",
          lines: [r.message.replace(/^That file has no transactions\.\s*/, "")],
        });
      } else {
        setNotice({
          kind: "problem",
          variant: "destructive",
          icon: "alert",
          title: "That CSV couldn't be read",
          lines: [r.message],
        });
      }
      return;
    }

    setFiles((prev) => prev.map((f) => ({ ...f, problem: undefined })));

    startChecking(async () => {
      try {
        // The server finds the signed-in user's own portfolio; a new account
        // simply has no references yet.
        const known = await getKnownImportReferences();
        if (!known.ok) {
          setActionError(known.error);
          return;
        }
        const references = known.data.references;
        const plan = prepareUpload(reads, { instruments, knownReferences: references });

        if (plan.serverRows.length > MAX_ROWS) {
          setModel(modelFromPlan(plan, new Map(), true));
          setStep("check");
          return;
        }

        // A dry run on the server: it re-checks every row (including selling
        // more than is held) and writes nothing.
        const failed = new Map<number, string[]>();
        if (plan.ready.length > 0) {
          const dryRun = await validateImportRows(
            plan.ready.map((r) => ({ ...r.mapped, reference: r.reference, line: r.line })),
          );
          if (!dryRun.ok) {
            setActionError(dryRun.error);
            return;
          }
          for (const result of dryRun.data.results) {
            if (!result.ok) failed.set(result.row - 1, result.issues);
          }
        }
        setModel(modelFromPlan(plan, failed, false));
        setStep("check");
      } catch {
        setActionError(CHECK_FAILED);
      }
    });
  }

  function switchPreset(id: PresetId) {
    // Keep the file, change the broker, and check again straight away.
    setChoice(id);
    runPresetCheck(id);
  }

  function continueFromFile() {
    if (!choice) return;
    if (choice !== "other") {
      runPresetCheck(choice);
      return;
    }
    // Other path: parse, then go to the column-matching screen.
    const text = tab === "upload" ? (files[0]?.text ?? "") : pasteText;
    const parsed = parseCsv(text);
    if (!parsed.ok) {
      setNotice({
        kind: "problem",
        variant: "destructive",
        icon: "alert",
        title: "That CSV couldn't be read",
        lines: [parsed.error.message],
      });
      return;
    }
    if (parsed.data.rows.length === 0) {
      setNotice({
        kind: "problem",
        variant: "destructive",
        icon: "alert",
        title: "That file has no transactions",
        lines: ["It only has a header row, or nothing at all. Check you exported the right dates."],
      });
      return;
    }
    setNotice(null);
    setCsv(parsed.data);
    setMapping(guessMapping(parsed.data.headers));
    setStep("map");
  }

  const continueDisabled =
    tab === "upload" ? files.length === 0 : pasteText.trim().length === 0;

  // ----- Other path: validate the mapped rows ------------------------------

  function validateMapped() {
    if (!csv) return;
    const rows = buildMappedRows(csv, mapping);
    const references = assignFingerprintReferences(rows);
    const entries: MappedEntry[] = rows.map((mapped, index) => ({
      mapped,
      reference: references[index],
      line: index + 1,
      raw: (csv.rows[index] ?? []).join(", "),
    }));
    setActionError(null);
    startChecking(async () => {
      try {
        const result = await getKnownImportReferences();
        if (!result.ok) {
          setActionError(result.error);
          return;
        }
        const known = new Set(result.data.references);
        const fresh = entries.filter((e) => !known.has(e.reference));
        const already = entries.filter((e) => known.has(e.reference));
        let report: ImportValidationReport = { total: 0, validCount: 0, errorCount: 0, results: [] };
        if (fresh.length > 0) {
          const dryRun = await validateImportRows(
            fresh.map((e) => ({ ...e.mapped, reference: e.reference, line: e.line })),
          );
          if (!dryRun.ok) {
            setActionError(dryRun.error);
            return;
          }
          report = dryRun.data;
        }
        setModel(modelFromMapped(report, fresh, already));
        setStep("check");
      } catch {
        setActionError(CHECK_FAILED);
      }
    });
  }

  // ----- Screen 3: check -> Screen 4: import -------------------------------

  function runImport() {
    if (!model || model.sendRows.length === 0) return;
    const current = model;
    setActionError(null);
    startImporting(async () => {
      try {
        const result = await importTransactions(current.sendRows);
        setOutcome(
          result.ok
            ? {
                ok: true,
                imported: result.data.imported,
                skipped: current.skipped.length,
                alreadyImported: current.already.length + result.data.alreadyImportedCount,
              }
            : { ok: false, message: result.error },
        );
      } catch {
        setOutcome({ ok: false, message: "The server did not answer. Please try again." });
      }
      setStep("done");
    });
  }

  // "I added the stocks": reload the tracked list (the page data) without
  // losing the file, and go back to the file screen. Continue is held until
  // the fresh list has arrived, so the next check uses it.
  function recheckAfterTracking() {
    startRefreshing(() => router.refresh());
    setStep("file");
  }

  function startOver() {
    setStep("broker");
    setChoice(null);
    setFiles([]);
    setPasteText("");
    setTab("upload");
    setNotice(null);
    setCsv(null);
    setModel(null);
    setOutcome(null);
    setActionError(null);
  }

  // ----- Render ------------------------------------------------------------

  return (
    <div className="max-w-6xl">
      <div className="mb-4">
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
          Step {stepIndex + 1} of {steps.length} — {steps[stepIndex].label}
        </p>
        <div className="flex gap-1" aria-hidden="true">
          {steps.map((s, index) => (
            <span
              key={s.id}
              className={
                index <= stepIndex
                  ? "h-1 flex-1 rounded bg-blue-600 dark:bg-blue-500"
                  : "h-1 flex-1 rounded bg-slate-200 dark:bg-slate-800"
              }
            />
          ))}
        </div>
      </div>

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
          {step === "broker" ? (
            <div>
              <h2 className="text-base font-medium">Which broker is your file from?</h2>
              <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
                Pick one and we&apos;ll show you how to get the file. Nothing is saved until you
                check it and press Import.
              </p>
              <BrokerGrid selected={choice} onChoose={chooseBroker} />
            </div>
          ) : null}

          {step === "file" && choice ? (
            <div>
              <h2 className="mb-4 text-base font-medium">
                {choice === "other"
                  ? "Your file"
                  : choice === "template"
                    ? "Your InvestIQ template file"
                    : `Your ${getPresetCard(choice).name} file`}
              </h2>
              <FileStep
                choice={choice}
                tab={tab}
                onTabChange={setTab}
                pasteText={pasteText}
                onPasteChange={setPasteText}
                files={files}
                onAddFiles={addFiles}
                onRemoveFile={removeFile}
                notice={notice}
                onNotice={setNotice}
                isChecking={isChecking}
                continueDisabled={continueDisabled || isRefreshing}
                onContinue={continueFromFile}
                onBack={() => {
                  setNotice(null);
                  setStep("broker");
                }}
                onSwitchPreset={switchPreset}
                onChooseAnother={chooseAnotherFile}
              />
            </div>
          ) : null}

          {step === "map" && csv ? (
            <MapStep
              csv={csv}
              mapping={mapping}
              onMappingChange={setMapping}
              isValidating={isChecking}
              onBack={() => setStep("file")}
              onValidate={validateMapped}
            />
          ) : null}

          {step === "check" && model ? (
            <CheckStep
              model={model}
              isImporting={isImporting}
              isRechecking={isRefreshing}
              onBack={() => setStep(isOther ? "map" : "file")}
              onImport={runImport}
              onImportAnother={startOver}
              onRecheck={recheckAfterTracking}
            />
          ) : null}

          {step === "done" && outcome ? (
            <ResultStep
              outcome={outcome}
              onTryAgain={() => {
                // Back to the check results without re-uploading anything.
                setOutcome(null);
                setStep("check");
              }}
              onImportAnother={startOver}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// Broker file presets: the public face of the pure import layer.
//
// Everything here is pure (no I/O, no database, no React) so it runs the same
// in the browser and in tests. The wizard picks a card, reads the file with
// `readBrokerFile`, and (after adding the tracked-instrument list and the
// portfolio's known references) calls `prepareUpload` to get the groups shown
// on the Check screen plus the exact rows to send to the server.
//
// Golden rule: a preset never guesses. If it is unsure what a row means the
// row is SKIPPED with a plain reason; it never invents or repairs a value and
// never treats an unknown word as a buy.

import { etoro } from "./etoro";
import { fidelity } from "./fidelity";
import { ibkr } from "./ibkr";
import { resolveRows } from "./resolve-symbol";
import { saxo } from "./saxo";
import { schwab } from "./schwab";
import {
  finishRead,
  loadTable,
  sortOldestFirst,
  splitAlreadyImported,
  toServerRows,
  type ServerRow,
} from "./shared";
import { template } from "./template";
import { trading212 } from "./trading212";
import type {
  CannotReadRow,
  PresetDefinition,
  PresetId,
  ReadOk,
  ReadRefused,
  ReadResult,
  ReadyRow,
  RowOutcome,
  SkippedRow,
  Table,
  TrackedInstrument,
} from "./types";

export type {
  CannotReadRow,
  PresetDefinition,
  PresetId,
  PresetMappedRow,
  ReadOk,
  ReadRefused,
  ReadResult,
  ReadyRow,
  RowOutcome,
  SkipCode,
  SkippedRow,
  TrackedInstrument,
  TransactionTypeName,
} from "./types";
export type { ServerRow } from "./shared";
export { splitAlreadyImported, toServerRows, sortOldestFirst } from "./shared";
export { resolveBrokerSymbol, resolveRows } from "./resolve-symbol";
export { translateExchange } from "./exchange-map";

// ---------------------------------------------------------------------------
// The registry and the cards for Screen 1
// ---------------------------------------------------------------------------

export const PRESETS: Record<PresetId, PresetDefinition> = {
  ibkr,
  saxo,
  trading212,
  etoro,
  schwab,
  fidelity,
  template,
};

/** What Screen 1 and Screen 2 show for one choice. */
export type PresetCard = {
  /** A preset id, or "other" for the old column-by-column screen. */
  id: PresetId | "other";
  /** Card title. */
  name: string;
  /** Shows the small "Beta" tag. */
  beta: boolean;
  /** Extra explanation when only part of a preset is Beta. */
  betaDetail?: string;
  /** One line under the card: what file it wants and how to get it. */
  hint: string;
  /** What kind of file this is, in a few words. */
  fileDescription: string;
  /** "How to get this file": 3 to 5 plain steps. */
  steps: string[];
  /** Several files can be added together (per-file date limits). */
  multiFile: boolean;
  /** Shown above the drop zone when the file has no currency column. */
  fixedCurrencyNote?: string;
  /** Placeholder for the paste box. */
  headerExample?: string;
  /** Link for the template card. */
  templateDownload?: string;
  /** Which sheet to save, for workbook-style exports. */
  excelSheetHint?: string;
};

const USD_NOTE = "Amounts in this file are read as US dollars.";

/** The cards in the order the spec requires. */
export const PRESET_CARDS: PresetCard[] = [
  {
    id: "ibkr",
    name: "Interactive Brokers",
    beta: false,
    betaDetail: "The Activity Statement layout is Beta. The Flex query layout is not.",
    hint: "Activity Statement CSV, or a Flex query saved as CSV (each Flex file covers up to 365 days).",
    fileDescription: "Activity Statement CSV or Flex CSV",
    steps: [
      "Sign in to Interactive Brokers and open Performance & Reports, then Statements.",
      "Either run an Activity Statement for your dates and choose CSV, or run a Flex query (Trades section, CSV output, column headers on).",
      "For a Flex query, tick these fields: Symbol, Asset Class, Currency, Trade Date, Buy/Sell, Quantity, Trade Price, Commission, Commission Currency and Transaction ID.",
      "Download the file. It is a .csv file. Each Flex file covers up to 365 days, so add several files for longer.",
    ],
    multiFile: true,
    headerExample: ibkr.headerExample,
  },
  {
    id: "saxo",
    name: "Saxo",
    beta: true,
    hint: "Transaction overview, Export, then save the Excel file as CSV.",
    fileDescription: "Trades export saved as CSV",
    steps: [
      "Sign in to Saxo and open the transaction overview.",
      "Choose the Trades export for the dates you want, then Export.",
      "Open the downloaded Excel file and save the transaction sheet as CSV (UTF-8).",
      "This Saxo file does not list commissions, so fees are left at 0. Add any fees by hand.",
    ],
    multiFile: false,
    headerExample: saxo.headerExample,
    excelSheetHint: "Save the transaction sheet.",
  },
  {
    id: "trading212",
    name: "Trading 212",
    beta: false,
    hint: "History, then Export. Each file covers up to 365 days, so add several files for longer.",
    fileDescription: "History export CSV",
    steps: [
      "Sign in to Trading 212 and open History.",
      "Choose Export, then pick a date range of up to 365 days (one year).",
      "Download the file. It is a .csv file.",
      "Need more than one year? Repeat for the next year and add each file below.",
    ],
    multiFile: true,
    headerExample: trading212.headerExample,
  },
  {
    id: "etoro",
    name: "eToro",
    beta: true,
    hint: 'Account statement: save the "Account Activity" sheet as CSV. Amounts are read as US dollars.',
    fileDescription: "Account Activity sheet saved as CSV",
    steps: [
      "Sign in to eToro and open your account statement for the dates you want.",
      "Download it. It is an Excel workbook with several sheets.",
      "Open the workbook and save the 'Account Activity' sheet as CSV (UTF-8).",
      "eToro shows dividends after tax, and does not show a price: InvestIQ works the price out from the amount and the units.",
    ],
    multiFile: false,
    fixedCurrencyNote: USD_NOTE,
    headerExample: etoro.headerExample,
    excelSheetHint: "Save the 'Account Activity' sheet.",
  },
  {
    id: "schwab",
    name: "Charles Schwab",
    beta: false,
    hint: "Transaction history exported as CSV. Amounts are read as US dollars.",
    fileDescription: "Transaction history CSV",
    steps: [
      "Sign in to Charles Schwab and open your account's transaction history.",
      "Pick the dates you want.",
      "Choose Export and download the CSV file.",
      "Schwab lists newest first. InvestIQ turns the list around for you.",
    ],
    multiFile: false,
    fixedCurrencyNote: USD_NOTE,
    headerExample: schwab.headerExample,
  },
  {
    id: "fidelity",
    name: "Fidelity",
    beta: true,
    hint: "Activity and orders, History, then download as CSV.",
    fileDescription: "Activity and orders history CSV",
    steps: [
      "Sign in to Fidelity and open Activity and orders, then History.",
      "Pick the dates you want.",
      "Download the file as CSV.",
      "Fidelity lists newest first. InvestIQ turns the list around for you.",
    ],
    multiFile: false,
    headerExample: fidelity.headerExample,
  },
  {
    id: "template",
    name: "InvestIQ template for Gulf brokers",
    beta: false,
    hint: "Download our simple template, fill in one row per trade, then upload it.",
    fileDescription: "InvestIQ template CSV",
    steps: [
      "Download the template below.",
      "Fill in one row per trade. Dates must look like 2026-03-14.",
      "Use Buy, Sell, Dividend, Deposit, Withdrawal or Fee in the Type column.",
      "Save it as CSV and upload it here. It works for any broker.",
    ],
    multiFile: false,
    templateDownload: "/broker-template.csv",
    headerExample: template.headerExample,
  },
  {
    id: "other",
    name: "Other",
    beta: false,
    hint: "Any CSV. You match the columns yourself.",
    fileDescription: "Any CSV file",
    steps: [],
    multiFile: false,
  },
];

export function getPresetCard(id: PresetId | "other"): PresetCard {
  const card = PRESET_CARDS.find((c) => c.id === id);
  // The list above covers every id, so this cannot fail.
  return card as PresetCard;
}

// ---------------------------------------------------------------------------
// Reading a file
// ---------------------------------------------------------------------------

function tagFile<T extends RowOutcome>(outcomes: T[], file: string | undefined): void {
  if (!file) return;
  for (const o of outcomes) o.file = file;
}

/** Plain-English "wrong file" message naming the missing columns. */
export function wrongFileMessage(presetName: string, missing: string[]): string {
  const shown = missing.slice(0, 5).join(", ");
  const more = missing.length > 5 ? ` and ${missing.length - 5} more` : "";
  return `This doesn't look like a ${presetName} file. It is missing these columns: ${shown}${more}.`;
}

/** Which presets does this table's header match? (In card order.) */
function matchingPresets(table: Table, except?: PresetId): PresetId[] {
  const out: PresetId[] = [];
  for (const card of PRESET_CARDS) {
    if (card.id === "other" || card.id === except) continue;
    if (PRESETS[card.id].check(table).ok) out.push(card.id);
  }
  return out;
}

/** Which presets does this file text look like? Empty when none match. */
export function detectPresets(text: string): PresetId[] {
  const loaded = loadTable(text);
  if (!loaded.ok) return [];
  return matchingPresets(loaded.table);
}

/**
 * Read one broker file with the chosen preset. Never throws. A wrong file is
 * refused with the missing column names and, when another preset's columns do
 * match, `suggestedPreset` so the screen can offer "Switch to <broker>".
 */
export function readBrokerFile(
  presetId: PresetId,
  text: string,
  options: { fileName?: string } = {},
): ReadResult {
  const def = PRESETS[presetId];
  const loaded = loadTable(text);
  if (!loaded.ok) {
    const refused: ReadRefused = { ok: false, reason: loaded.reason, message: loaded.message };
    return refused;
  }
  const check = def.check(loaded.table);
  if (!check.ok) {
    const others = matchingPresets(loaded.table, presetId);
    const refused: ReadRefused = {
      ok: false,
      reason: "wrong_file",
      message: wrongFileMessage(def.name, check.missing),
      missingColumns: check.missing,
      ...(others.length > 0 ? { suggestedPreset: others[0] } : {}),
    };
    return refused;
  }

  const result = finishRead(def, def.read(loaded.table));
  if (result.outcomes.length === 0) {
    const refused: ReadRefused = {
      ok: false,
      reason: "no_rows",
      message: "That file has no transactions. It only has a header row, or nothing at all. Check you exported the right dates.",
    };
    return refused;
  }
  tagFile(result.outcomes, options.fileName);
  return result;
}

// ---------------------------------------------------------------------------
// Several files, tracked tickers, already-imported rows
// ---------------------------------------------------------------------------

export type UploadPlan = {
  /** Rows that will be sent: new to the portfolio, tickers resolved, oldest first. */
  ready: ReadyRow[];
  /** The subset of `ready` that imports with a note to read. */
  withNote: ReadyRow[];
  /** Rows that should have imported but did not (bad value, untracked ticker). */
  needsFixing: CannotReadRow[];
  /** Rows we left out on purpose, each with a plain reason. Never sent. */
  skipped: SkippedRow[];
  /** Rows already in the portfolio, or repeated inside this upload. */
  alreadyImported: ReadyRow[];
  /** Tickers to track first (gathered from `needsFixing`). */
  untrackedTickers: string[];
  ignoredLines: number;
  ignoredSections: string[];
  /** Tax lines folded into a dividend. */
  absorbedLines: number;
  accountCount: number;
  /** Fixed currency the amounts were read in, if the file had no currency column. */
  currencyAssumed?: { code: string; label: string };
  /** Exactly the ready rows, in the shape the server receives. */
  serverRows: ServerRow[];
};

/**
 * Merge one or more read files and build the groups for the Check screen.
 * Order of work: merge and sort oldest first; drop rows already imported
 * (known references) and repeats inside the upload; match broker tickers to
 * the tracked instruments. Skipped and unreadable rows never reach
 * `serverRows`.
 */
export function prepareUpload(
  reads: ReadOk[],
  options: { instruments: TrackedInstrument[]; knownReferences: Iterable<string> },
): UploadPlan {
  const merged = sortOldestFirst(reads.flatMap((r) => r.ready));
  const { fresh, already } = splitAlreadyImported(merged, options.knownReferences);
  const resolved = resolveRows(fresh, options.instruments);

  const ready = resolved.rows.filter((r): r is ReadyRow => r.kind === "ready");
  const unresolved = resolved.rows.filter((r): r is CannotReadRow => r.kind === "cannot_read");

  const currencyAssumed = reads.find((r) => r.currencyAssumed)?.currencyAssumed;
  return {
    ready,
    withNote: ready.filter((r) => r.importNote),
    needsFixing: [...reads.flatMap((r) => r.cannotRead), ...unresolved].sort((a, b) => a.line - b.line),
    skipped: reads.flatMap((r) => r.skipped),
    alreadyImported: already,
    untrackedTickers: resolved.untrackedTickers,
    ignoredLines: reads.reduce((n, r) => n + r.ignoredLines, 0),
    ignoredSections: [...new Set(reads.flatMap((r) => r.ignoredSections))],
    absorbedLines: reads.reduce((n, r) => n + r.absorbedLines, 0),
    accountCount: Math.max(0, ...reads.map((r) => r.accountCount)),
    currencyAssumed,
    serverRows: toServerRows(ready),
  };
}

// ---------------------------------------------------------------------------
// Friendly checks on the file itself (Excel, too big, not a CSV)
// ---------------------------------------------------------------------------

/** Per-file size ceiling in the browser. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type UploadProblem = {
  kind: "excel" | "too_big" | "not_csv";
  title: string;
  message: string;
  /** A second line for brokers that need a particular sheet. */
  extra?: string;
};

export type UploadedFileInfo = {
  name: string;
  size?: number;
  /** The first few bytes (or characters) of the file, if you have them. */
  head?: string | Uint8Array;
};

const EXCEL_EXTENSIONS = ["xlsx", "xls", "xlsm", "xlsb", "ods"];
const NOT_CSV_EXTENSIONS = ["pdf", "doc", "docx", "png", "jpg", "jpeg", "gif", "zip", "json", "xml", "html", "htm"];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).trim().toLowerCase();
}

function headBytes(head: string | Uint8Array | undefined): number[] {
  if (head === undefined) return [];
  const out: number[] = [];
  const n = Math.min(head.length, 8);
  for (let i = 0; i < n; i++) {
    out.push(typeof head === "string" ? head.charCodeAt(i) & 0xff : head[i]);
  }
  return out;
}

/** Looks like an Excel workbook by its extension, or by its first bytes. */
export function isExcelFile(file: UploadedFileInfo): boolean {
  if (EXCEL_EXTENSIONS.includes(extensionOf(file.name))) return true;
  const b = headBytes(file.head);
  // "PK\3\4" is a zip container (.xlsx); D0 CF 11 E0 is the old .xls format.
  const zip = b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
  const ole = b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
  return zip || ole;
}

/**
 * Basic checks before reading: Excel workbook, over 5 MB, or not a text file.
 * Excel is NOT read (no spreadsheet library): the person is told how to save
 * a CSV instead.
 */
export function checkUploadedFile(
  file: UploadedFileInfo,
  presetId?: PresetId | "other",
): { ok: true } | ({ ok: false } & UploadProblem) {
  if (isExcelFile(file)) {
    const card = presetId ? getPresetCard(presetId) : undefined;
    return {
      ok: false,
      kind: "excel",
      title: "This is an Excel file",
      message: "Open it, choose File, Save As, CSV (UTF-8), then drop the CSV here.",
      ...(card?.excelSheetHint ? { extra: card.excelSheetHint } : {}),
    };
  }
  if (file.size !== undefined && file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      kind: "too_big",
      title: "That file is too big",
      message: "Files can be up to 5 MB. Try a shorter date range and export again.",
    };
  }
  const b = headBytes(file.head);
  const looksPdf = b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  if (NOT_CSV_EXTENSIONS.includes(extensionOf(file.name)) || looksPdf || b.includes(0)) {
    return {
      ok: false,
      kind: "not_csv",
      title: "We can't read that kind of file",
      message: "Please choose a .csv file. Excel files (.xlsx) need to be saved as CSV first.",
    };
  }
  return { ok: true };
}

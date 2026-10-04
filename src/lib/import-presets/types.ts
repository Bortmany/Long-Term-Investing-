// Shared types for the broker-file presets.
//
// A preset is a PURE function: raw file text in, a list of per-row outcomes
// out. Each line of the broker file ends up as exactly one of:
//   - ready        a filled-in row in the shared import format
//   - skipped      InvestIQ recognised it but cannot hold it (or does not
//                  recognise it) -> a code and a plain reason, never sent on
//   - cannot_read  it should have been importable but a value is bad
// Lines that are not transactions at all (titles, totals, footers) are
// dropped and only counted.
//
// A preset never invents or repairs a value, and never treats an unknown
// word as a buy.

export type PresetId =
  | "ibkr"
  | "saxo"
  | "trading212"
  | "etoro"
  | "schwab"
  | "fidelity"
  | "template";

export type TransactionTypeName =
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "FEE";

/** Same field names as MappedImportRow in src/lib/import-rows.ts (all text). */
export type PresetMappedRow = {
  ticker?: string;
  market?: string;
  type: TransactionTypeName;
  quantity?: string;
  pricePerUnit?: string;
  amount?: string;
  currency?: string;
  fee?: string;
  /** Always YYYY-MM-DD. */
  tradeDate: string;
  /** Always "Imported from <broker>" (plus, for one case, "Tax withheld"). */
  note: string;
};

export type SkipCode =
  | "split"
  | "option"
  | "asset_kind"
  | "currency"
  | "interest"
  | "conversion"
  | "reinvestment"
  | "corporate_action"
  | "transfer"
  | "fee_refund"
  | "tax_refund"
  | "reversal"
  | "unclear"
  | "unsupported_type"
  | "unknown_word";

export type ReadyRow = {
  kind: "ready";
  /** The broker file's OWN physical line number (1-based). */
  line: number;
  /** The line as text, for showing in the browser only. Never send this on. */
  raw: string;
  /** Which uploaded file (when several are merged). */
  file?: string;
  mapped: PresetMappedRow;
  /** Stable "already imported" reference (spec section 4). */
  reference: string;
  /** Set when the row imports but the person should read a note first. */
  importNote?: string;
  /** eToro only: the price was worked out as amount / units. */
  derivedPrice?: boolean;
  /** Internal: time of day (for ordering same-day rows). */
  sortTime?: string;
  /** Internal: the broker's own row id (before the "preset:" prefix). */
  stableId?: string;
  /** Internal: key used to pair a dividend with its tax line. */
  pairKey?: string;
};

export type SkippedRow = {
  kind: "skipped";
  line: number;
  raw: string;
  file?: string;
  code: SkipCode;
  /** Plain-English reason shown to the person. */
  reason: string;
};

export type CannotReadRow = {
  kind: "cannot_read";
  line: number;
  raw: string;
  file?: string;
  reason: string;
  /** Set when the only problem is that the ticker is not tracked yet. */
  untrackedTicker?: string;
};

export type RowOutcome = ReadyRow | SkippedRow | CannotReadRow;

// --- Table plumbing --------------------------------------------------------

export type TableRecord = {
  /** Physical line number in the broker's file (1-based). */
  line: number;
  cells: string[];
};

export type Table = { records: TableRecord[] };

export type HeaderCheck =
  | { ok: true }
  | { ok: false; missing: string[] };

/** A tax line waiting to be paired with its dividend. */
export type PendingWithholding = {
  line: number;
  raw: string;
  key: string;
  /** Positive number as text. */
  amount: string;
  currency: string;
  ticker: string;
  marketHint?: string;
  tradeDate: string;
  sortTime?: string;
};

/** What a preset hands back before the shared code finishes the job. */
export type DraftRead = {
  outcomes: RowOutcome[];
  withholdings: PendingWithholding[];
  /** Summary / section / footer lines that were dropped. */
  ignoredLines: number;
  /** IBKR Activity Statement: names of sections that are not read. */
  ignoredSections: string[];
  /** Distinct accounts seen (Fidelity), for the "N accounts" line. Never sent. */
  accountCount: number;
  /** Set when the file had no currency column and amounts are read in this one. */
  currencyAssumed?: { code: string; label: string };
  /** Interactive Brokers only: which file layout was read. */
  layout?: "activity" | "flex";
};

export type PresetDefinition = {
  id: PresetId;
  /** Display name, also used in "Imported from <name>". */
  name: string;
  beta: boolean;
  /** When the file has no currency column, amounts are read in this currency. */
  fixedCurrency?: { code: string; label: string };
  /**
   * How the file is ordered when the direction cannot be told from the data.
   * "detect" presets look at the first and last dated rows.
   */
  order: "oldest" | "detect-oldest" | "detect-newest";
  check(table: Table): HeaderCheck;
  read(table: Table): DraftRead;
  /** Header row shown as a placeholder in the paste box. */
  headerExample: string;
};

export type ReadOk = {
  ok: true;
  preset: PresetId;
  /** Every outcome in the broker file's own order. */
  outcomes: RowOutcome[];
  /** The ready rows, OLDEST FIRST, ready for the shared validation. */
  ready: ReadyRow[];
  skipped: SkippedRow[];
  cannotRead: CannotReadRow[];
  /** Tax lines folded into their dividend (not rows of their own). */
  absorbedLines: number;
  ignoredLines: number;
  ignoredSections: string[];
  accountCount: number;
  /** The file listed newest first (and was turned around). */
  wasNewestFirst: boolean;
  /** Set when amounts were read in a fixed currency (no currency column). */
  currencyAssumed?: { code: string; label: string };
  /** Interactive Brokers only: "activity" (Beta) or "flex". */
  layout?: "activity" | "flex";
};

export type ReadRefused = {
  ok: false;
  reason: "empty" | "parse_error" | "wrong_file" | "no_rows";
  /** Plain-English message. */
  message: string;
  /** Missing column names (wrong_file). */
  missingColumns?: string[];
  /** Another preset whose columns do match this file. */
  suggestedPreset?: PresetId;
};

export type ReadResult = ReadOk | ReadRefused;

/** The bit of a tracked instrument the resolver needs. */
export type TrackedInstrument = { ticker: string; market: string };

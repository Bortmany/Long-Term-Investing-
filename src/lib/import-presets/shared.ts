// Shared plumbing for every broker preset. Pure: no I/O, no database.
//
// What lives here:
//   - reading the file text (BOM, delimiter, real line numbers) on top of the
//     repo's ONE CSV parser (src/lib/csv.ts)
//   - finding the header row by column NAME (never by position)
//   - number and date readers that never guess
//   - exact decimal arithmetic (so 4.33 + 0.77 is 5.10, not 5.1000000001)
//   - pairing a dividend with its tax line
//   - import references ("already imported" fingerprints)
//   - putting rows oldest first while remembering the file's own line numbers

import { parseCsv } from "../csv";
import { isSupportedCurrency } from "./lists";
import type {
  CannotReadRow,
  DraftRead,
  PendingWithholding,
  PresetDefinition,
  PresetMappedRow,
  ReadOk,
  ReadyRow,
  RowOutcome,
  SkipCode,
  SkippedRow,
  Table,
  TableRecord,
  TransactionTypeName,
} from "./types";

// ---------------------------------------------------------------------------
// Reading the file text
// ---------------------------------------------------------------------------

/** Remove a leading byte-order mark (Excel "CSV UTF-8" files have one). */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Trim a cell and turn odd spaces (non-breaking, zero-width) into plain ones. */
export function cleanCell(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/[​-‍﻿]/g, "")
    .replace(/ /g, " ")
    .trim();
}

/**
 * Which delimiter does this file use? Comma unless the first line that has
 * any delimiter has no commas but has semicolons or tabs (European Excel).
 */
export function detectDelimiter(text: string): "," | ";" | "\t" {
  let inQuotes = false;
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === "\n" || ch === "\r") {
      if (commas + semis + tabs > 0) break;
      continue;
    }
    if (ch === ",") commas++;
    else if (ch === ";") semis++;
    else if (ch === "\t") tabs++;
  }
  if (commas === 0 && (semis > 0 || tabs > 0)) return semis >= tabs ? ";" : "\t";
  return ",";
}

type Scanned = { text: string; lines: number[] };

/**
 * Walk the text once to (a) remember the physical line each record starts on
 * and (b) when the delimiter is not a comma, re-write the file as a plain
 * comma file so the repo's parser can read it. This is NOT a second CSV
 * parser: parseCsv still does all the real parsing.
 */
function scanRecords(text: string, delimiter: string): Scanned {
  const rewrite = delimiter !== ",";
  const lines: number[] = [];
  let out = "";

  let line = 1;
  let recordStartLine = 1;
  let inQuotes = false;
  let fieldStart = true;
  let field = "";
  let fieldNonSpace = false;
  let record: string[] = [];

  const endField = () => {
    record.push(field);
    field = "";
    fieldNonSpace = false;
    fieldStart = true;
  };
  const endRecord = () => {
    // Same test the parser uses to drop blank lines: a single empty field.
    const blank = record.length === 0 && !fieldNonSpace;
    if (!blank) {
      endField();
      lines.push(recordStartLine);
      if (rewrite) {
        out += record.map((f) => `"${f.replace(/"/g, '""')}"`).join(",") + "\n";
      }
    }
    record = [];
    field = "";
    fieldNonSpace = false;
    fieldStart = true;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          fieldNonSpace = true;
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line += 1;
        field += ch;
        if (ch.trim() !== "") fieldNonSpace = true;
      }
      continue;
    }
    if (ch === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
      continue;
    }
    if (ch === delimiter) {
      endField();
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") continue;
      endRecord();
      line += 1;
      recordStartLine = line;
      continue;
    }
    if (ch === "\n") {
      endRecord();
      line += 1;
      recordStartLine = line;
      continue;
    }
    field += ch;
    fieldStart = false;
    if (ch.trim() !== "") fieldNonSpace = true;
  }
  if (field.length > 0 || record.length > 0 || fieldNonSpace) endRecord();

  return { text: rewrite ? out : text, lines };
}

export type LoadResult =
  | { ok: true; table: Table }
  | { ok: false; reason: "empty" | "parse_error"; message: string };

/**
 * Turn raw file text into a table of records with their real line numbers.
 * Never throws. Handles a byte-order mark and comma, semicolon or tab files.
 */
export function loadTable(rawText: string): LoadResult {
  const text = stripBom(rawText);
  if (text.trim() === "") {
    return {
      ok: false,
      reason: "empty",
      message: "That file has no transactions. It only has a header row, or nothing at all.",
    };
  }
  const delimiter = detectDelimiter(text);
  const scanned = scanRecords(text, delimiter);
  const parsed = parseCsv(scanned.text);
  if (!parsed.ok) {
    if (parsed.error.code === "empty_input") {
      return {
        ok: false,
        reason: "empty",
        message: "That file has no transactions. It only has a header row, or nothing at all.",
      };
    }
    return { ok: false, reason: "parse_error", message: parsed.error.message };
  }
  const all = [parsed.data.headers, ...parsed.data.rows];
  const records: TableRecord[] = all.map((cells, index) => ({
    line: scanned.lines[index] ?? index + 1,
    cells: cells.map(cleanCell),
  }));
  return { ok: true, table: { records } };
}

/** The line as text for showing in the browser (never sent to the server). */
export function rawLine(cells: string[]): string {
  return cells.join(", ").slice(0, 600);
}

// ---------------------------------------------------------------------------
// Header matching (by NAME, never by position)
// ---------------------------------------------------------------------------

export function normHeader(value: string): string {
  return cleanCell(value).toLowerCase().replace(/\s+/g, " ");
}

/** A lower-cased, single-spaced word for type-word tables. */
export function normWord(value: string): string {
  return normHeader(value);
}

export type ColSpec = {
  key: string;
  /** Accepted header names; the first is the one shown in messages. */
  names: string[];
  required?: boolean;
};

export type HeaderLocation = {
  /** Index into table.records of the header row. */
  index: number;
  cols: Record<string, number | undefined>;
};

export type LocateResult =
  | ({ ok: true } & HeaderLocation)
  | { ok: false; missing: string[] };

export function matchColumns(cells: string[], specs: ColSpec[]): Record<string, number | undefined> {
  const normalised = cells.map(normHeader);
  const cols: Record<string, number | undefined> = {};
  for (const spec of specs) {
    const wanted = spec.names.map(normHeader);
    const idx = normalised.findIndex((h) => wanted.includes(h));
    cols[spec.key] = idx === -1 ? undefined : idx;
  }
  return cols;
}

/**
 * Find the header row: the first record (within the first `maxScan`) that has
 * every required column. Leading title or blank lines are skipped. When no
 * record qualifies, report what the closest one is missing.
 */
export function locateHeader(table: Table, specs: ColSpec[], maxScan = 40): LocateResult {
  const required = specs.filter((s) => s.required);
  let bestScore = -1;
  let bestMissing: string[] = required.map((s) => s.names[0]);
  const limit = Math.min(table.records.length, maxScan);
  for (let i = 0; i < limit; i++) {
    const cols = matchColumns(table.records[i].cells, specs);
    const missing = required.filter((s) => cols[s.key] === undefined).map((s) => s.names[0]);
    if (missing.length === 0) return { ok: true, index: i, cols };
    const score = required.length - missing.length;
    if (score > bestScore) {
      bestScore = score;
      bestMissing = missing;
    }
  }
  return { ok: false, missing: bestMissing };
}

/** Text of a cell by column index ("" when the column or cell is absent). */
export function at(cells: string[], index: number | undefined): string {
  if (index === undefined) return "";
  return cleanCell(cells[index]);
}

/** True when every cell is empty. */
export function isBlankRecord(cells: string[]): boolean {
  return cells.every((c) => cleanCell(c) === "");
}

/** True when this record repeats the header row (some exports repeat it). */
export function isRepeatOfHeader(cells: string[], header: string[]): boolean {
  const a = cells.map(normHeader).join("|");
  const b = header.map(normHeader).join("|");
  return a === b;
}

// ---------------------------------------------------------------------------
// Exact decimals
// ---------------------------------------------------------------------------

const TEN = BigInt(10);
const ZERO = BigInt(0);

type Dec = { neg: boolean; int: bigint; scale: number };

function parseDec(text: string): Dec | null {
  const m = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) return null;
  const frac = m[3] ?? "";
  return { neg: m[1] === "-", int: BigInt(m[2] + frac), scale: frac.length };
}

function fmtDec(d: Dec): string {
  const digits = d.int.toString().padStart(d.scale + 1, "0");
  const body =
    d.scale === 0 ? digits : `${digits.slice(0, digits.length - d.scale)}.${digits.slice(digits.length - d.scale)}`;
  return d.neg && d.int !== ZERO ? `-${body}` : body;
}

function signed(d: Dec, scale: number): bigint {
  const v = d.int * TEN ** BigInt(scale - d.scale);
  return d.neg ? -v : v;
}

function fromSigned(v: bigint, scale: number): Dec {
  return { neg: v < ZERO, int: v < ZERO ? -v : v, scale };
}

/** a + b, exactly. Null when either is not a plain decimal. */
export function addDecimals(a: string, b: string): string | null {
  const x = parseDec(a);
  const y = parseDec(b);
  if (!x || !y) return null;
  const scale = Math.max(x.scale, y.scale);
  return fmtDec(fromSigned(signed(x, scale) + signed(y, scale), scale));
}

/** The number without its minus sign. */
export function absDecimal(a: string): string {
  return a.startsWith("-") ? a.slice(1) : a.startsWith("+") ? a.slice(1) : a;
}

/** -1, 0 or 1. Null when not a plain decimal. */
export function signOf(a: string): -1 | 0 | 1 | null {
  const x = parseDec(a);
  if (!x) return null;
  if (x.int === ZERO) return 0;
  return x.neg ? -1 : 1;
}

/** a / b to `outScale` decimals (rounded half up), trailing zeros trimmed. */
export function divideDecimals(a: string, b: string, outScale = 8): string | null {
  const x = parseDec(a);
  const y = parseDec(b);
  if (!x || !y || y.int === ZERO) return null;
  // a/b = (xi / 10^xs) / (yi / 10^ys) = xi * 10^ys / (yi * 10^xs)
  const num = x.int * TEN ** BigInt(y.scale + outScale);
  const den = y.int * TEN ** BigInt(x.scale);
  let q = num / den;
  const rem = num % den;
  if (rem * BigInt(2) >= den) q += BigInt(1);
  const negative = x.neg !== y.neg && q !== ZERO;
  let text = fmtDec({ neg: negative, int: q, scale: outScale });
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  return text;
}

// ---------------------------------------------------------------------------
// Number reader
// ---------------------------------------------------------------------------

/** How a broker writes numbers. Never guessed: each preset declares one. */
export type NumberStyle = "plain" | "us" | "eu";

export type NumberRead = { ok: true; value: string } | { ok: false };

const PLAIN_RE = /^([+-])?(\d+)(\.\d+)?$/;
// "$2,054.00", "-$12.00", "1,234.5" (comma = thousands, dot = decimal)
const US_RE = /^([+-])?\$?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/;
// "-422,99", "1.234,56" (dot = thousands, comma = decimal)
const EU_RE = /^([+-])?(\d{1,3}(?:\.\d{3})+|\d+)(,\d+)?$/;

/**
 * Read one number exactly as written in the declared style. A cell that does
 * not fit exactly (letters, two dots, Arabic-Indic digits, "1e5") is NOT a
 * number: the result is `ok: false` and the row becomes "cannot read".
 * Returns a normalised plain decimal (sign, digits, dot), trailing zeros kept.
 */
export function readNumber(text: string, style: NumberStyle): NumberRead {
  const t = cleanCell(text);
  if (t === "") return { ok: false };
  let m: RegExpExecArray | null;
  let intPart: string;
  let frac: string;
  if (style === "plain") {
    m = PLAIN_RE.exec(t);
    if (!m) return { ok: false };
    intPart = m[2];
    frac = (m[3] ?? "").slice(1);
  } else if (style === "us") {
    m = US_RE.exec(t);
    if (!m) return { ok: false };
    intPart = m[2].replace(/,/g, "");
    frac = (m[3] ?? "").slice(1);
  } else {
    m = EU_RE.exec(t);
    if (!m) return { ok: false };
    intPart = m[2].replace(/\./g, "");
    frac = (m[3] ?? "").slice(1);
  }
  const sign = m[1] === "-" ? "-" : "";
  return { ok: true, value: `${sign}${intPart}${frac ? `.${frac}` : ""}` };
}

// ---------------------------------------------------------------------------
// Date reader (day-first versus month-first is NEVER guessed)
// ---------------------------------------------------------------------------

export type DateFormat =
  | "YYYY-MM-DD"
  | "YYYYMMDD"
  | "MM/DD/YYYY"
  | "DD/MM/YYYY"
  | "DD-MMM-YYYY";

export type DateRead = { ok: true; date: string; time?: string } | { ok: false };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function daysIn(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function buildDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const TIME_PART = "(?:(?:,\\s*|\\s+|T)(\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?)?";

const DATE_PATTERNS: Record<DateFormat, string> = {
  "YYYY-MM-DD": "(\\d{4})-(\\d{2})-(\\d{2})",
  YYYYMMDD: "(\\d{4})(\\d{2})(\\d{2})",
  "MM/DD/YYYY": "(\\d{2})/(\\d{2})/(\\d{4})",
  "DD/MM/YYYY": "(\\d{2})/(\\d{2})/(\\d{4})",
  "DD-MMM-YYYY": "(\\d{1,2})-([A-Za-z]{3})-(\\d{4})",
};

/**
 * Read a date in exactly the declared format and return YYYY-MM-DD.
 * A real calendar date is required (no 31 February). With `allowTime`, a time
 * of day may follow (space, comma or "T" separated, optional fractional
 * seconds and zone); the date part is taken exactly as written.
 */
export function readDate(text: string, format: DateFormat, allowTime = false): DateRead {
  const t = cleanCell(text);
  const tail = allowTime && format !== "YYYYMMDD" ? TIME_PART : "";
  const m = new RegExp(`^${DATE_PATTERNS[format]}${tail}$`).exec(t);
  if (!m) return { ok: false };
  let date: string | null;
  let rest: string[];
  if (format === "YYYY-MM-DD" || format === "YYYYMMDD") {
    date = buildDate(Number(m[1]), Number(m[2]), Number(m[3]));
    rest = m.slice(4);
  } else if (format === "MM/DD/YYYY") {
    date = buildDate(Number(m[3]), Number(m[1]), Number(m[2]));
    rest = m.slice(4);
  } else if (format === "DD/MM/YYYY") {
    date = buildDate(Number(m[3]), Number(m[2]), Number(m[1]));
    rest = m.slice(4);
  } else {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    date = month === 0 ? null : buildDate(Number(m[3]), month, Number(m[1]));
    rest = m.slice(4);
  }
  if (!date) return { ok: false };
  const [hh, mm, ss] = rest;
  if (hh !== undefined && mm !== undefined) {
    if (Number(hh) > 23 || Number(mm) > 59 || (ss !== undefined && Number(ss) > 59)) return { ok: false };
    return { ok: true, date, time: `${hh}:${mm}:${ss ?? "00"}` };
  }
  return { ok: true, date };
}

// ---------------------------------------------------------------------------
// Value readers with the shared validation's plain wording
// ---------------------------------------------------------------------------

export type FieldLabel = "quantity" | "price" | "amount" | "fee";

const FIELD_NOT_NUMBER: Record<FieldLabel, string> = {
  quantity: "Enter a quantity as a number.",
  price: "Enter a price as a number.",
  amount: "Enter an amount as a number.",
  fee: "Enter the fee as a number.",
};
const FIELD_NOT_POSITIVE: Record<FieldLabel, string> = {
  quantity: "Quantity must be greater than zero.",
  price: "Price per unit must be greater than zero.",
  amount: "Amount must be greater than zero.",
  fee: "Fee cannot be negative.",
};

export type ValueRead = { ok: true; value: string } | { ok: false; reason: string };

/** Read a required number; a missing or malformed cell is a plain reason. */
export function readRequired(text: string, style: NumberStyle, label: FieldLabel): ValueRead {
  if (cleanCell(text) === "") return { ok: false, reason: `Missing ${label}.` };
  const n = readNumber(text, style);
  if (!n.ok) return { ok: false, reason: FIELD_NOT_NUMBER[label] };
  return { ok: true, value: n.value };
}

/** Same, then the ABSOLUTE value (brokers write sells and costs as negatives). */
export function readPositive(
  text: string,
  style: NumberStyle,
  label: FieldLabel,
  options: { absolute?: boolean } = {},
): ValueRead {
  const r = readRequired(text, style, label);
  if (!r.ok) return r;
  const value = options.absolute ? absDecimal(r.value) : r.value;
  if (signOf(value) !== 1) return { ok: false, reason: FIELD_NOT_POSITIVE[label] };
  return { ok: true, value };
}

/** A fee cell: blank means 0; otherwise the absolute value. */
export function readFee(text: string, style: NumberStyle): ValueRead {
  if (cleanCell(text) === "") return { ok: true, value: "0" };
  const r = readRequired(text, style, "fee");
  if (!r.ok) return r;
  return { ok: true, value: absDecimal(r.value) };
}

/** Leading characters of an unknown word, safe to show in a message. */
export function shortWord(word: string): string {
  const w = cleanCell(word).replace(/\s+/g, " ");
  return w.length > 40 ? `${w.slice(0, 40)}...` : w;
}

// ---------------------------------------------------------------------------
// Making outcomes
// ---------------------------------------------------------------------------

export function skipRow(rec: TableRecord, code: SkipCode, reason: string): SkippedRow {
  return { kind: "skipped", line: rec.line, raw: rawLine(rec.cells), code, reason };
}

export function cannotReadRow(rec: TableRecord, reason: string): CannotReadRow {
  return { kind: "cannot_read", line: rec.line, raw: rawLine(rec.cells), reason };
}

/** A word that is not in the preset's own table: skipped, never a buy. */
export function unknownWordRow(rec: TableRecord, word: string): SkippedRow {
  const w = shortWord(word);
  return skipRow(
    rec,
    "unknown_word",
    w === "" ? "This line has no type word, so we left it out." : `We do not recognise the word '${w}' in this column`,
  );
}

/** Returns a skip reason when the currency is not one the app holds, else null. */
export function currencyProblem(code: string): string | null {
  const c = cleanCell(code).toUpperCase();
  if (c === "") return "No currency is shown on this line, so we left it out.";
  if (!isSupportedCurrency(c)) return `Currency ${c} is not supported yet`;
  return null;
}

export function currencySkipRow(rec: TableRecord, code: string): SkippedRow {
  const reason = currencyProblem(code) ?? "Currency is not supported yet";
  return skipRow(rec, "currency", reason);
}

export type ReadyInput = {
  rec: TableRecord;
  brokerName: string;
  type: TransactionTypeName;
  ticker?: string;
  market?: string;
  quantity?: string;
  price?: string;
  amount?: string;
  currency?: string;
  fee?: string;
  date: string;
  /** Overrides the standard "Imported from <broker>" note. */
  note?: string;
  importNote?: string;
  stableId?: string;
  pairKey?: string;
  sortTime?: string;
  derivedPrice?: boolean;
};

export function importedFromNote(brokerName: string): string {
  return `Imported from ${brokerName}`;
}

/** Build a ready row. The reference is filled in later by finishRead. */
export function readyRow(input: ReadyInput): ReadyRow {
  const mapped: PresetMappedRow = {
    type: input.type,
    tradeDate: input.date,
    note: input.note ?? importedFromNote(input.brokerName),
  };
  if (input.ticker) mapped.ticker = input.ticker;
  if (input.market) mapped.market = input.market;
  if (input.quantity !== undefined) mapped.quantity = input.quantity;
  if (input.price !== undefined) mapped.pricePerUnit = input.price;
  if (input.amount !== undefined) mapped.amount = input.amount;
  if (input.currency) mapped.currency = input.currency.toUpperCase();
  if (input.fee !== undefined) mapped.fee = input.fee;
  const row: ReadyRow = {
    kind: "ready",
    line: input.rec.line,
    raw: rawLine(input.rec.cells),
    mapped,
    reference: "",
  };
  if (input.importNote) row.importNote = input.importNote;
  if (input.stableId) row.stableId = input.stableId;
  if (input.pairKey) row.pairKey = input.pairKey;
  if (input.sortTime) row.sortTime = input.sortTime;
  if (input.derivedPrice) row.derivedPrice = true;
  return row;
}

/** "A fee of 0.30 EUR was not included ..." (spec section 3, Fee). */
export function feeMismatchNote(amount: string, currency: string): string {
  return `A fee of ${amount} ${currency.toUpperCase()} was not included because it is in a different currency. Add it by hand if you want it counted.`;
}

export function feeUnknownCurrencyNote(amount: string): string {
  return `A fee of ${amount} was not included because the file does not say which currency it is in. Add it by hand if you want it counted.`;
}

// ---------------------------------------------------------------------------
// Dividend + tax pairing
// ---------------------------------------------------------------------------

export function pairKeyFor(ticker: string, date: string, currency: string): string {
  return `${ticker.toUpperCase()}|${date}|${currency.toUpperCase()}`;
}

/**
 * Fold each tax line into its dividend when exactly ONE dividend has the same
 * ticker, date and currency (the tax becomes the dividend's fee, so net cash
 * matches). Any tax line that cannot be paired cleanly becomes a FEE entry
 * tied to the ticker with the note "Tax withheld". Returns the new outcome
 * list in file order and how many tax lines were absorbed.
 */
export function pairWithholdings(
  outcomes: RowOutcome[],
  pending: PendingWithholding[],
  brokerName: string,
): { outcomes: RowOutcome[]; absorbed: number } {
  const dividendsByKey = new Map<string, ReadyRow[]>();
  for (const o of outcomes) {
    if (o.kind === "ready" && o.mapped.type === "DIVIDEND" && o.pairKey) {
      const list = dividendsByKey.get(o.pairKey) ?? [];
      list.push(o);
      dividendsByKey.set(o.pairKey, list);
    }
  }
  const pendingByKey = new Map<string, PendingWithholding[]>();
  for (const p of pending) {
    const list = pendingByKey.get(p.key) ?? [];
    list.push(p);
    pendingByKey.set(p.key, list);
  }

  const result = [...outcomes];
  let absorbed = 0;
  for (const [key, taxes] of pendingByKey) {
    const dividends = dividendsByKey.get(key) ?? [];
    if (dividends.length === 1) {
      let total = "0";
      for (const t of taxes) total = addDecimals(total, t.amount) ?? total;
      dividends[0].mapped.fee = total;
      absorbed += taxes.length;
      continue;
    }
    for (const t of taxes) {
      const rec: TableRecord = { line: t.line, cells: [] };
      const fee = readyRow({
        rec,
        brokerName,
        type: "FEE",
        ticker: t.ticker,
        market: t.marketHint,
        amount: t.amount,
        currency: t.currency,
        date: t.tradeDate,
        note: "Tax withheld",
        sortTime: t.sortTime,
      });
      fee.raw = t.raw;
      result.push(fee);
    }
  }
  result.sort((a, b) => a.line - b.line);
  return { outcomes: result, absorbed };
}

// ---------------------------------------------------------------------------
// Import references ("already imported")
// ---------------------------------------------------------------------------

/** A short, stable text fingerprint (cyrb53). Not a secret; just a label. */
export function shortHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Fingerprint of a row's important values (never notes, accounts or ids). */
export function rowFingerprint(row: ReadyRow): string {
  const m = row.mapped;
  return shortHash(
    [
      m.type,
      (m.ticker ?? "").toUpperCase(),
      (m.market ?? "").toUpperCase(),
      m.tradeDate,
      row.sortTime ?? "",
      m.quantity ?? "",
      m.pricePerUnit ?? "",
      m.amount ?? "",
      m.fee ?? "",
      (m.currency ?? "").toUpperCase(),
    ].join("|"),
  );
}

/**
 * Give every ready row its reference. A broker id gives "<preset>:<id>"
 * (a repeat of the same id inside one file gets "#2", "#3" so partial fills
 * are not lost). Otherwise "<preset>:h:<fingerprint>#<n>" where n counts
 * identical rows in the file, so two genuine identical fills stay two rows
 * and a re-import produces the same references.
 */
export function assignReferences(presetId: string, rows: ReadyRow[]): void {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.stableId) {
      const base = `${presetId}:${row.stableId}`;
      const n = (counts.get(base) ?? 0) + 1;
      counts.set(base, n);
      row.reference = n === 1 ? base : `${base}#${n}`;
    } else {
      const base = `${presetId}:h:${rowFingerprint(row)}`;
      const n = (counts.get(base) ?? 0) + 1;
      counts.set(base, n);
      row.reference = `${base}#${n}`;
    }
  }
}

/**
 * Drop rows already in the portfolio, and repeats inside the same upload
 * (overlapping files). The first copy in an upload is kept; later copies go
 * to `already`, together with rows whose reference is already known.
 */
export function splitAlreadyImported<T extends { reference: string }>(
  rows: T[],
  knownReferences: Iterable<string>,
): { fresh: T[]; already: T[] } {
  const known = new Set(knownReferences);
  const seen = new Set<string>();
  const fresh: T[] = [];
  const already: T[] = [];
  for (const row of rows) {
    if (known.has(row.reference) || seen.has(row.reference)) {
      already.push(row);
    } else {
      seen.add(row.reference);
      fresh.push(row);
    }
  }
  return { fresh, already };
}

// ---------------------------------------------------------------------------
// Ordering: oldest first, original line numbers kept
// ---------------------------------------------------------------------------

function sortKey(row: ReadyRow): string {
  return `${row.mapped.tradeDate}|${row.sortTime ?? ""}`;
}

/** Stable sort by date (and time when known). Same-day rows keep their order. */
export function sortOldestFirst<T extends ReadyRow>(rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const ka = sortKey(a.row);
      const kb = sortKey(b.row);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return a.index - b.index;
    })
    .map((x) => x.row);
}

/**
 * Hand the ready rows over oldest first. A newest-first file is reversed
 * first (so same-day rows keep their true order), then sorted by date.
 * Direction is read from the first and last dated rows; only a tie falls back
 * to what the preset expects.
 */
export function orderOldestFirst(
  rows: ReadyRow[],
  order: PresetDefinition["order"],
): { rows: ReadyRow[]; newestFirst: boolean } {
  let newestFirst = false;
  if (order !== "oldest" && rows.length > 1) {
    const first = rows[0].mapped.tradeDate;
    const last = rows[rows.length - 1].mapped.tradeDate;
    if (first > last) newestFirst = true;
    else if (first === last) newestFirst = order === "detect-newest";
  }
  const walked = newestFirst ? [...rows].reverse() : rows;
  return { rows: sortOldestFirst(walked), newestFirst };
}

// ---------------------------------------------------------------------------
// Finishing a read
// ---------------------------------------------------------------------------

export function finishRead(def: PresetDefinition, draft: DraftRead): ReadOk {
  const paired = pairWithholdings(draft.outcomes, draft.withholdings, def.name);
  const outcomes = paired.outcomes;
  const readyInFileOrder = outcomes.filter((o): o is ReadyRow => o.kind === "ready");
  assignReferences(def.id, readyInFileOrder);
  const ordered = orderOldestFirst(readyInFileOrder, def.order);
  return {
    ok: true,
    preset: def.id,
    outcomes,
    ready: ordered.rows,
    skipped: outcomes.filter((o): o is SkippedRow => o.kind === "skipped"),
    cannotRead: outcomes.filter((o): o is CannotReadRow => o.kind === "cannot_read"),
    absorbedLines: paired.absorbed,
    ignoredLines: draft.ignoredLines,
    ignoredSections: draft.ignoredSections,
    accountCount: draft.accountCount,
    wasNewestFirst: ordered.newestFirst,
    currencyAssumed: draft.currencyAssumed ?? def.fixedCurrency,
    ...(draft.layout ? { layout: draft.layout } : {}),
  };
}

// ---------------------------------------------------------------------------
// Cash rows
// ---------------------------------------------------------------------------

export type CashAmount =
  | { ok: true; amount: string }
  | { ok: false; skip: boolean; reason: string };

/**
 * The amount for a DEPOSIT or WITHDRAWAL, always positive. With
 * `strictSign`, a sign that contradicts the type word (a negative deposit,
 * a positive withdrawal) is SKIPPED as unclear instead of being flipped.
 */
export function cashAmount(
  type: "DEPOSIT" | "WITHDRAWAL",
  signedValue: string,
  strictSign = true,
): CashAmount {
  const sign = signOf(signedValue);
  if (sign === null) return { ok: false, skip: false, reason: FIELD_NOT_NUMBER.amount };
  if (sign === 0) return { ok: false, skip: false, reason: FIELD_NOT_POSITIVE.amount };
  if (strictSign && ((type === "DEPOSIT" && sign < 0) || (type === "WITHDRAWAL" && sign > 0))) {
    return {
      ok: false,
      skip: true,
      reason: `The amount's sign does not match a ${type === "DEPOSIT" ? "deposit" : "withdrawal"}, so we left it out instead of guessing.`,
    };
  }
  return { ok: true, amount: absDecimal(signedValue) };
}

/** What the server receives for one ready row. Nothing else leaves the browser. */
export type ServerRow = {
  /** The broker file's own line number, for messages. */
  line: number;
  file?: string;
  reference: string;
  mapped: PresetMappedRow;
};

/** Only ready rows, oldest first. Skipped and unreadable rows never go. */
export function toServerRows(ready: ReadyRow[]): ServerRow[] {
  return ready.map((r) => ({
    line: r.line,
    ...(r.file ? { file: r.file } : {}),
    reference: r.reference,
    mapped: { ...r.mapped },
  }));
}

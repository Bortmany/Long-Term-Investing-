// Pure CSV-import row validation — no I/O, unit-testable.
//
// The import server action feeds this the mapped rows plus the list of
// instruments that already exist; everything here is plain-English issue
// reporting. Rows are validated with the same zod schemas used by the
// single-transaction actions, so an imported row can never be looser than
// a hand-entered one.

import type { Currency, Market } from "@prisma/client";
import {
  transactionInputSchema,
  toTransactionRecord,
  type TransactionInput,
} from "./transaction-schema";

/** One CSV row after column mapping — everything still raw text. */
export type MappedImportRow = {
  ticker?: string;
  market?: string;
  type?: string;
  quantity?: string;
  pricePerUnit?: string;
  amount?: string;
  currency?: string;
  fee?: string;
  tradeDate?: string;
  note?: string;
};

/** The instrument info needed to resolve tickers (from existing Instrument rows). */
export type KnownInstrument = {
  id: string;
  ticker: string;
  market: Market;
  currency: Currency;
};

export type ImportRowResult =
  | {
      /** 1-based data-row number (row 1 = first row after the CSV header). */
      row: number;
      ok: true;
      /** The validated, ready-to-write transaction (amount server-derived). */
      parsed: TransactionInput;
    }
  | {
      row: number;
      ok: false;
      /** Plain-English problems with this row. */
      issues: string[];
    };

export type ImportValidationReport = {
  total: number;
  validCount: number;
  errorCount: number;
  results: ImportRowResult[];
};

const TRANSACTION_TYPES = [
  "BUY",
  "SELL",
  "DIVIDEND",
  "DEPOSIT",
  "WITHDRAWAL",
  "FEE",
] as const;

const INSTRUMENT_TYPES = new Set<string>(["BUY", "SELL", "DIVIDEND"]);
const CASH_ONLY_TYPES = new Set<string>(["DEPOSIT", "WITHDRAWAL"]);

/** Empty/whitespace-only cells count as "not provided". */
function cell(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveInstrument(
  ticker: string,
  market: string | undefined,
  instruments: KnownInstrument[],
): { ok: true; instrument: KnownInstrument } | { ok: false; issue: string } {
  const wantedTicker = ticker.toUpperCase();
  const wantedMarket = market?.toUpperCase();

  const byTicker = instruments.filter((i) => i.ticker === wantedTicker);
  if (byTicker.length === 0) {
    return {
      ok: false,
      issue: `Unknown ticker '${ticker}' — check spelling or track it first.`,
    };
  }
  if (wantedMarket) {
    const match = byTicker.find((i) => i.market === wantedMarket);
    if (!match) {
      return {
        ok: false,
        issue: `Ticker '${ticker}' is not tracked on market '${market}' — check the market column or track it first.`,
      };
    }
    return { ok: true, instrument: match };
  }
  if (byTicker.length > 1) {
    const markets = byTicker.map((i) => i.market).join(", ");
    return {
      ok: false,
      issue: `Ticker '${ticker}' exists on more than one market (${markets}) — add a market column to say which one.`,
    };
  }
  return { ok: true, instrument: byTicker[0] };
}

/**
 * Validate one mapped row. Pure: resolves tickers against the given
 * instrument list, never the database.
 */
export function validateMappedRow(
  row: MappedImportRow,
  rowNumber: number,
  instruments: KnownInstrument[],
): ImportRowResult {
  const issues: string[] = [];

  // --- Type ---
  const rawType = cell(row.type)?.toUpperCase();
  if (!rawType) {
    issues.push("Missing transaction type (Buy, Sell, Dividend, Deposit, Withdrawal or Fee).");
  } else if (!(TRANSACTION_TYPES as readonly string[]).includes(rawType)) {
    issues.push(
      `Type '${cell(row.type)}' is not recognized — use Buy, Sell, Dividend, Deposit, Withdrawal or Fee.`,
    );
  }

  // --- Instrument (required for BUY/SELL/DIVIDEND, optional for FEE, none for cash rows) ---
  const ticker = cell(row.ticker);
  let instrument: KnownInstrument | null = null;
  if (rawType && INSTRUMENT_TYPES.has(rawType) && !ticker) {
    issues.push(`Type '${rawType}' requires a Ticker.`);
  }
  if (rawType && CASH_ONLY_TYPES.has(rawType) && ticker) {
    issues.push(`Type '${rawType}' is a cash entry — leave the Ticker column empty.`);
  }
  if (ticker && rawType && !CASH_ONLY_TYPES.has(rawType)) {
    const resolved = resolveInstrument(ticker, cell(row.market), instruments);
    if (resolved.ok) {
      instrument = resolved.instrument;
    } else {
      issues.push(resolved.issue);
    }
  }

  // --- Trade date (checked here for a friendlier message than zod's) ---
  if (!cell(row.tradeDate)) {
    issues.push("Missing trade date.");
  }

  // --- Quantity/price presence per type (friendlier than raw zod output) ---
  if ((rawType === "BUY" || rawType === "SELL") && (!cell(row.quantity) || !cell(row.pricePerUnit))) {
    issues.push(`Type '${rawType}' requires a Quantity and Price.`);
  }
  if (
    (rawType === "DIVIDEND" || rawType === "DEPOSIT" || rawType === "WITHDRAWAL" || rawType === "FEE") &&
    !cell(row.amount)
  ) {
    issues.push(`Type '${rawType}' requires an Amount.`);
  }

  // --- Currency (fall back to the instrument's own currency when omitted) ---
  const currency = cell(row.currency)?.toUpperCase() ?? instrument?.currency;
  if (!currency) {
    issues.push("Missing currency (OMR, USD, SAR or AED).");
  }

  if (issues.length > 0) {
    return { row: rowNumber, ok: false, issues };
  }

  // --- Full schema validation (numbers, dates, enum values) ---
  const candidate: Record<string, unknown> = {
    type: rawType,
    tradeDate: cell(row.tradeDate),
    currency,
    note: cell(row.note),
  };
  if (instrument) candidate.instrumentId = instrument.id;
  if (rawType === "BUY" || rawType === "SELL") {
    candidate.quantity = cell(row.quantity);
    candidate.pricePerUnit = cell(row.pricePerUnit);
    if (cell(row.fee) !== undefined) candidate.fee = cell(row.fee);
    // `amount` from the CSV is deliberately ignored for BUY/SELL — the server
    // always derives it from quantity × price (golden rule: no client amounts).
  } else {
    candidate.amount = cell(row.amount);
    // Only DIVIDEND rows carry a fee (withholding). For a FEE row the amount
    // IS the fee; deposits and withdrawals have no fee field at all.
    if (rawType === "DIVIDEND" && cell(row.fee) !== undefined) {
      candidate.fee = cell(row.fee);
    }
  }

  const parsed = transactionInputSchema.safeParse(candidate);
  if (!parsed.success) {
    const messages = [...new Set(parsed.error.issues.map((issue) => issue.message))];
    return { row: rowNumber, ok: false, issues: messages };
  }
  return { row: rowNumber, ok: true, parsed: parsed.data };
}

// A hair of tolerance so floating-point noise on a legitimate "sell
// everything" row can't trip the guard (mirrors the single-transaction path).
const IMPORT_QUANTITY_EPSILON = 1e-6;

/**
 * Walk the already-validated import rows IN ORDER and reject the first SELL
 * that would sell more shares than are held at that point in the file. Shares
 * held = whatever the account already owned before the import
 * (`startingQuantities`, keyed by instrumentId) PLUS every BUY earlier in the
 * same file. Without this guard an imported SELL of shares the account never
 * owned would credit cash it never earned — a fabricated number (golden rule).
 * Pure: no database, so it is unit-tested directly.
 */
export function findImportOversell(
  results: ImportRowResult[],
  startingQuantities: Map<string, number>,
): { row: number; message: string } | null {
  // Copy so we never mutate the caller's map.
  const held = new Map(startingQuantities);

  for (const result of results) {
    if (!result.ok) continue;
    const input = result.parsed;
    if (input.type !== "BUY" && input.type !== "SELL") continue;
    if (!("instrumentId" in input) || !input.instrumentId) continue;

    const current = held.get(input.instrumentId) ?? 0;
    if (input.type === "BUY") {
      held.set(input.instrumentId, current + input.quantity);
      continue;
    }

    // SELL — must not exceed what is held after the earlier rows.
    if (input.quantity > current + IMPORT_QUANTITY_EPSILON) {
      const heldLabel = current > 0 ? current : "no";
      return {
        row: result.row,
        message:
          `Row ${result.row} sells ${input.quantity} share${
            input.quantity === 1 ? "" : "s"
          }, but only ${heldLabel} share${current === 1 ? "" : "s"} ${
            current === 1 ? "is" : "are"
          } held at that point (counting the buys earlier in this file). ` +
          `Add the matching buys first, or sell fewer.`,
      };
    }
    held.set(input.instrumentId, current - input.quantity);
  }

  return null;
}

/**
 * Run the same oversell projection the commit step enforces
 * (findImportOversell) against a validation report, IN PLACE — so a dry run
 * that reports "all rows look good" is telling the truth rather than
 * skipping the one check that can still fail at commit time. Mutates the
 * offending row to `ok: false` with a plain-English issue and updates the
 * report's counts to match. Pure: no database, so it is unit-tested directly.
 */
export function applyOversellProjection(
  report: ImportValidationReport,
  startingQuantities: Map<string, number>,
): void {
  const oversell = findImportOversell(report.results, startingQuantities);
  if (!oversell) return;

  const index = report.results.findIndex((r) => r.row === oversell.row);
  if (index === -1) return;

  report.results[index] = { row: oversell.row, ok: false, issues: [oversell.message] };
  report.validCount -= 1;
  report.errorCount += 1;
}

/** Validate every mapped row — a pure dry run, nothing is written anywhere. */
export function validateMappedRows(
  rows: MappedImportRow[],
  instruments: KnownInstrument[],
): ImportValidationReport {
  const results = rows.map((row, index) =>
    validateMappedRow(row, index + 1, instruments),
  );
  const validCount = results.filter((r) => r.ok).length;
  return {
    total: rows.length,
    validCount,
    errorCount: results.length - validCount,
    results,
  };
}

export { toTransactionRecord };

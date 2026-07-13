// Pure helpers for the CSV import wizard's column-mapping step — no I/O.
//
// A "mapping" is one entry per CSV column: either the MappedImportRow field
// that column feeds, or "ignore". The initial guess matches each CSV header
// case-insensitively against the sample file's header names
// (public/sample-transactions.csv): ticker, market, type, trade_date,
// quantity, price_per_unit, amount, currency, fee, note.

import type { MappedImportRow } from "@/lib/import-rows";

/** The fields a CSV column can be mapped to. */
export type ImportFieldKey = keyof MappedImportRow;

/** One column's mapping: a transaction field, or "ignore this column". */
export type ColumnMapping = ImportFieldKey | "ignore";

/** Every mappable field with its plain-English label, in display order. */
export const IMPORT_FIELDS: { key: ImportFieldKey; label: string }[] = [
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

/** Sample-file header name (lowercased) → field. The auto-guess table. */
const HEADER_GUESSES: Record<string, ImportFieldKey> = {
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

/**
 * Guess a mapping for each CSV header by case-insensitive match against the
 * sample file's header names. Anything unrecognized starts as "ignore" —
 * the owner can always change it by hand in Step 2.
 */
export function guessMapping(headers: string[]): ColumnMapping[] {
  return headers.map(
    (header) => HEADER_GUESSES[header.trim().toLowerCase()] ?? "ignore",
  );
}

/**
 * Turn raw CSV data rows into MappedImportRow objects using the chosen
 * mapping. Ignored columns are dropped; if two columns map to the same
 * field, the right-most one wins (last write).
 */
export function buildMappedRows(
  rows: string[][],
  mapping: ColumnMapping[],
): MappedImportRow[] {
  return rows.map((cells) => {
    const mapped: MappedImportRow = {};
    mapping.forEach((field, columnIndex) => {
      if (field === "ignore") return;
      mapped[field] = cells[columnIndex] ?? "";
    });
    return mapped;
  });
}

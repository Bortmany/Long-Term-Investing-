"use client";

// The "Match columns" screen of the Other path: today's column-by-column
// mapping, unchanged except for 44px buttons. Used only when a person picks
// "Other"; the broker presets skip it.

import * as React from "react";
import { LoaderCircle } from "lucide-react";

import type { MappedImportRow } from "@/lib/import-rows";
import type { CsvData } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StickyActions } from "./sticky-actions";

export const IGNORE = "ignore";

export const MAP_TARGETS: { key: keyof MappedImportRow; label: string }[] = [
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

export function guessMapping(headers: string[]): string[] {
  return headers.map((header) => HEADER_GUESSES[header.trim().toLowerCase()] ?? IGNORE);
}

/** Apply the chosen mapping to every data row (raw strings, no conversion). */
export function buildMappedRows(csv: CsvData, mapping: string[]): MappedImportRow[] {
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

export function MapStep({
  csv,
  mapping,
  onMappingChange,
  isValidating,
  onBack,
  onValidate,
}: {
  csv: CsvData;
  mapping: string[];
  onMappingChange: (mapping: string[]) => void;
  isValidating: boolean;
  onBack: () => void;
  onValidate: () => void;
}) {
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

  const previewRows = csv.rows.slice(0, 3);

  return (
    <div>
      <h2 className="mb-4 text-base font-medium">Match columns</h2>
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
          More than one column is mapped to {duplicateTargets.join(" and ")} — map one of them
          to something else or ignore it before validating.
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

      <StickyActions>
        <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={isValidating}>
          Back
        </Button>
        <Button
          type="button"
          size="lg"
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
      </StickyActions>
    </div>
  );
}

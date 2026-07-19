// Pure transformation of one FinancialStatements fetch into the exact
// row/column shape the Financial Statements card renders (ui-spec §4.2): a
// table with fiscal periods as COLUMNS (most recent leftmost, up to 5 years)
// and line items as ROWS. No I/O here — this only reshapes data the caller
// already got from src/lib/data.
//
// Because one getFinancialStatements() call returns every period from a
// single fetch, all periods share the same source/asOf — that badge is
// rendered once per column header by the caller, never re-derived here.
import type { StatementKind } from "@/lib/data";

// Fields FMP returns alongside the real line items that are never worth
// showing as a numeric "line item" row (dates, ids, currency codes, …).
const META_FIELDS = new Set([
  "date",
  "symbol",
  "reportedCurrency",
  "cik",
  "fillingDate",
  "acceptedDate",
  "calendarYear",
  "period",
  "link",
  "finalLink",
]);

// The handful of fields ui-spec §4.2 names explicitly, with a proper label.
// Anything else present in the payload falls back to a rough title-cased
// label (see fallbackLabel) — "not worth hand-curating every possible FMP
// field name up front" per the spec.
const KNOWN_LABELS: Record<StatementKind, Record<string, string>> = {
  income: {
    revenue: "Revenue",
    costOfRevenue: "Cost of Revenue",
    grossProfit: "Gross Profit",
    operatingIncome: "Operating Income",
    netIncome: "Net Income",
  },
  balance: {
    totalAssets: "Total Assets",
    totalLiabilities: "Total Liabilities",
    totalStockholdersEquity: "Total Stockholders Equity",
  },
  "cash-flow": {
    operatingCashFlow: "Operating Cash Flow",
    freeCashFlow: "Free Cash Flow",
  },
};

/** "ebitdaratio" → "Ebitdaratio" — a rough, honest fallback (ui-spec §4.2's own example). */
function fallbackLabel(key: string): string {
  return key.length === 0 ? key : key.charAt(0).toUpperCase() + key.slice(1);
}

function labelFor(kind: StatementKind, key: string): string {
  return KNOWN_LABELS[kind][key] ?? fallbackLabel(key);
}

/** Known fields first (in their curated order), then everything else as it appears. */
function fieldOrder(kind: StatementKind, keys: string[]): string[] {
  const known = Object.keys(KNOWN_LABELS[kind]).filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !known.includes(k));
  return [...known, ...rest];
}

function parseRowDate(row: Record<string, unknown>): number {
  const value = row.date;
  if (typeof value !== "string") return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** "FY2025" from calendarYear (preferred) or the row's date field. */
function periodLabel(row: Record<string, unknown>): string {
  const calendarYear = row.calendarYear;
  if (typeof calendarYear === "string" && calendarYear.trim())
    return `FY${calendarYear.trim()}`;
  if (typeof calendarYear === "number") return `FY${calendarYear}`;
  const date = row.date;
  if (typeof date === "string" && /^\d{4}/.test(date))
    return `FY${date.slice(0, 4)}`;
  return "Unknown period";
}

export type StatementTableRow = {
  key: string;
  label: string;
  /** One value per period column, in the same order as `periods`; null = not reported that period. */
  values: (number | null)[];
};

export type StatementTable = {
  periods: string[];
  rows: StatementTableRow[];
  /** The reporting currency FMP attached to the rows, if present — informational only. */
  reportedCurrency: string | null;
};

const MAX_PERIODS = 5;

export function buildStatementTable(
  kind: StatementKind,
  rows: Record<string, unknown>[],
): StatementTable {
  const sorted = [...rows].sort((a, b) => parseRowDate(b) - parseRowDate(a));
  const periodRows = sorted.slice(0, MAX_PERIODS);
  const periods = periodRows.map(periodLabel);

  const firstRow = periodRows[0];
  const fieldKeys = firstRow
    ? Object.keys(firstRow).filter(
        (key) => !META_FIELDS.has(key) && typeof firstRow[key] === "number",
      )
    : [];
  const ordered = fieldOrder(kind, fieldKeys);

  const tableRows: StatementTableRow[] = ordered.map((key) => ({
    key,
    label: labelFor(kind, key),
    values: periodRows.map((row) => {
      const value = row[key];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }),
  }));

  const reportedCurrency =
    firstRow && typeof firstRow.reportedCurrency === "string"
      ? firstRow.reportedCurrency
      : null;

  return { periods, rows: tableRows, reportedCurrency };
}

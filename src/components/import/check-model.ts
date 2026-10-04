// The "Check" screen's data, built in the browser from what the pure import
// layer returned. Pure functions only: no React, no server code, so this file
// is safe to import from client components.
//
// Golden rule: every figure on the Check screen is copied from the user's own
// file (or counted from it). Nothing here invents, repairs or converts a
// number. A row that is not understood is listed with its reason, never
// guessed.

import type { ImportValidationReport, MappedImportRow } from "@/lib/import-rows";
import type { UploadPlan, ReadyRow } from "@/lib/import-presets";

/** One row as the Check screen shows it. */
export type DisplayRow = {
  key: string;
  /** The broker file's own line number (or the data-row number on the Other path). */
  line: number;
  file?: string;
  type: string;
  ticker?: string;
  date: string;
  quantity?: string;
  price?: string;
  amount?: string;
  currency?: string;
  fee?: string;
  /** Set when the row imports but the person should read a note first. */
  importNote?: string;
  /** eToro: price worked out from amount and units. */
  derivedPrice?: boolean;
  raw: string;
};

export type NeedItem = {
  key: string;
  line: number;
  file?: string;
  reasons: string[];
  raw: string;
};

export type SkippedItem = {
  key: string;
  line: number;
  file?: string;
  reason: string;
  raw: string;
};

/** What goes to the server for one row: the mapped fields plus its reference. */
export type SendRow = MappedImportRow & { reference?: string; line?: number };

export type CheckModel = {
  /** Every row that will be imported, including the ones with a note. */
  ready: DisplayRow[];
  needs: NeedItem[];
  skipped: SkippedItem[];
  already: DisplayRow[];
  untrackedTickers: string[];
  ignoredLines: number;
  ignoredSections: string[];
  absorbedLines: number;
  accountCount: number;
  currencyLabel?: string;
  /** True when any shown price was worked out from amount and units. */
  anyDerivedPrice: boolean;
  /** More than 2,000 rows would be sent: Import is hidden. */
  tooMany: boolean;
  /** Exactly the rows the Import button sends, aligned with `ready`. */
  sendRows: SendRow[];
};

export const MAX_ROWS = 2000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-01-12" -> "12 Jan 2026". Anything else is shown exactly as given. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

const TYPE_LABELS: Record<string, string> = {
  BUY: "Buy",
  SELL: "Sell",
  DIVIDEND: "Dividend",
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  FEE: "Fee",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type.trim().toUpperCase()] ?? type;
}

export function isTrade(type: string): boolean {
  const t = type.trim().toUpperCase();
  return t === "BUY" || t === "SELL";
}

/** True when a fee/tax text is a positive number worth showing. */
export function hasFee(fee: string | undefined): boolean {
  if (!fee) return false;
  const n = Number(fee.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0;
}

/** The headline figure, made only from the row's own fields. */
export function figureText(row: DisplayRow): string {
  const cur = row.currency ? ` ${row.currency}` : "";
  if (isTrade(row.type)) {
    const parts = [row.quantity, row.price].filter((p): p is string => !!p);
    return `${parts.join(" x ")}${cur}`.trim();
  }
  return `${row.amount ?? ""}${cur}`.trim();
}

export function displayFromPreset(r: ReadyRow): DisplayRow {
  const m = r.mapped;
  return {
    key: `${r.file ?? ""}#${r.line}#${r.reference}`,
    line: r.line,
    file: r.file,
    type: m.type,
    ticker: m.ticker,
    date: m.tradeDate,
    quantity: m.quantity,
    price: m.pricePerUnit,
    amount: m.amount,
    currency: m.currency,
    fee: m.fee,
    importNote: r.importNote,
    derivedPrice: r.derivedPrice,
    raw: r.raw,
  };
}

function sendRowFromPreset(r: ReadyRow): SendRow {
  return { ...r.mapped, reference: r.reference, line: r.line };
}

/** Build the model for the preset path. `failed` maps a row's position in plan.ready to its server problems. */
export function modelFromPlan(
  plan: UploadPlan,
  failed: Map<number, string[]>,
  tooMany: boolean,
): CheckModel {
  const okReady: ReadyRow[] = [];
  const needs: NeedItem[] = plan.needsFixing.map((n) => ({
    key: `n#${n.file ?? ""}#${n.line}`,
    line: n.line,
    file: n.file,
    reasons: [n.reason],
    raw: n.raw,
  }));
  plan.ready.forEach((r, index) => {
    const problems = failed.get(index);
    if (problems) {
      needs.push({
        key: `v#${r.file ?? ""}#${r.line}`,
        line: r.line,
        file: r.file,
        reasons: problems,
        raw: r.raw,
      });
    } else {
      okReady.push(r);
    }
  });
  needs.sort((a, b) => a.line - b.line);

  return {
    ready: okReady.map(displayFromPreset),
    needs,
    skipped: plan.skipped.map((s) => ({
      key: `s#${s.file ?? ""}#${s.line}`,
      line: s.line,
      file: s.file,
      reason: s.reason,
      raw: s.raw,
    })),
    already: plan.alreadyImported.map(displayFromPreset),
    untrackedTickers: plan.untrackedTickers,
    ignoredLines: plan.ignoredLines,
    ignoredSections: plan.ignoredSections,
    absorbedLines: plan.absorbedLines,
    accountCount: plan.accountCount,
    currencyLabel: plan.currencyAssumed?.label,
    anyDerivedPrice: okReady.some((r) => r.derivedPrice),
    tooMany,
    sendRows: tooMany ? [] : okReady.map(sendRowFromPreset),
  };
}

/** Group skipped rows by reason, keeping first-seen order. */
export function groupByReason(items: SkippedItem[]): { reason: string; items: SkippedItem[] }[] {
  const order: string[] = [];
  const map = new Map<string, SkippedItem[]>();
  for (const item of items) {
    const list = map.get(item.reason);
    if (list) list.push(item);
    else {
      map.set(item.reason, [item]);
      order.push(item.reason);
    }
  }
  return order.map((reason) => ({ reason, items: map.get(reason) ?? [] }));
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** The one bold sentence at the top of the Check screen. */
export function summarySentence(model: CheckModel): string {
  const ready = model.ready.length;
  const needs = model.needs.length;
  const skipped = model.skipped.length;
  const already = model.already.length;
  const total = ready + needs + skipped + already;
  const noted = model.ready.filter((r) => r.importNote).length;

  if (total > 0 && needs === 0 && skipped === 0 && already === 0 && !model.tooMany) {
    return total === 1 ? "The 1 row looks good." : `All ${total} rows look good.`;
  }
  if (ready === 0) {
    return `${total} ${plural(total, "row", "rows")} found, but none can be imported.`;
  }
  const parts: string[] = [];
  parts.push(
    `${ready} ${plural(ready, "is", "are")} ready to import${noted > 0 ? ` (${noted} with a note)` : ""}`,
  );
  if (skipped > 0) parts.push(`${skipped} will be skipped`);
  if (already > 0) parts.push(`${already} ${plural(already, "was", "were")} already imported`);
  if (needs > 0) parts.push(`${needs} ${plural(needs, "needs", "need")} fixing`);
  return `${total} ${plural(total, "row", "rows")} found. ${parts.join(", ")}.`;
}

/** One row on the "Other" path, with its label for "already imported" checks. */
export type MappedEntry = {
  mapped: MappedImportRow;
  reference: string;
  /** Data-row number: row 1 is the first row after the CSV header. */
  line: number;
  raw: string;
};

function displayFromEntry(e: MappedEntry): DisplayRow {
  const m = e.mapped;
  return {
    key: `r#${e.line}`,
    line: e.line,
    type: m.type ?? "",
    ticker: m.ticker,
    date: m.tradeDate ?? "",
    quantity: m.quantity,
    price: m.pricePerUnit,
    amount: m.amount,
    currency: m.currency,
    fee: m.fee,
    raw: e.raw,
  };
}

/**
 * Build the model for the "Other" path (column mapping). `fresh` is what was
 * sent for the dry run (report row N is fresh[N-1]); `already` are rows whose
 * label is already in the portfolio.
 */
export function modelFromMapped(
  report: ImportValidationReport,
  fresh: MappedEntry[],
  already: MappedEntry[],
): CheckModel {
  const ready: DisplayRow[] = [];
  const needs: NeedItem[] = [];
  const sendRows: SendRow[] = [];
  for (const result of report.results) {
    const entry = fresh[result.row - 1];
    if (!entry) continue;
    if (!result.ok) {
      needs.push({ key: `n#${entry.line}`, line: entry.line, reasons: result.issues, raw: entry.raw });
      continue;
    }
    ready.push(displayFromEntry(entry));
    sendRows.push({ ...entry.mapped, reference: entry.reference, line: entry.line });
  }
  return {
    ready,
    needs,
    skipped: [],
    already: already.map(displayFromEntry),
    untrackedTickers: [],
    ignoredLines: 0,
    ignoredSections: [],
    absorbedLines: 0,
    accountCount: 0,
    anyDerivedPrice: false,
    tooMany: false,
    sendRows,
  };
}

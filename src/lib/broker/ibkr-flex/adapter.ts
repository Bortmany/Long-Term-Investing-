// Flex XML report -> the rows the Step 4a Interactive Brokers preset reads.
//
// The adapter's ONLY job is turning each <Trade> element into one line of the
// preset's "Layout B" table (same header names, values passed through
// VERBATIM). Signs, dates, currencies, asset classes, tickers and the import
// reference are all decided by the real preset (src/lib/import-presets/ibkr.ts),
// so a synced row gets exactly the reference the same row gets from a file.
//
// A tiny hand-written reader is used instead of an XML library: it only
// scans for <Trade .../> tags and their attributes, never expands entities
// (apart from the five standard ones), and refuses any DOCTYPE/ENTITY.

import { readBrokerFile } from "@/lib/import-presets";
import type { ReadOk } from "@/lib/import-presets/types";
import { LAYOUT_MESSAGE, UNREADABLE_MESSAGE } from "./errors";

/** Layout B header names, in order, with the XML attribute each one comes from. */
export const FLEX_COLUMNS: { header: string; attributes: string[]; required: boolean }[] = [
  { header: "CurrencyPrimary", attributes: ["currency"], required: true },
  { header: "AssetClass", attributes: ["assetCategory"], required: true },
  { header: "Symbol", attributes: ["symbol"], required: true },
  { header: "TradeDate", attributes: ["tradeDate"], required: true },
  { header: "Buy/Sell", attributes: ["buySell"], required: true },
  { header: "Quantity", attributes: ["quantity"], required: true },
  { header: "TradePrice", attributes: ["tradePrice"], required: true },
  { header: "IBCommission", attributes: ["ibCommission"], required: false },
  { header: "IBCommissionCurrency", attributes: ["ibCommissionCurrency"], required: false },
  // transactionID is the de-duplication key; tradeID / ibExecID are fallbacks.
  { header: "TransactionID", attributes: ["transactionID", "tradeID", "ibExecID"], required: true },
  { header: "ListingExchange", attributes: ["listingExchange"], required: false },
];

export const MAX_REPORT_TRADES = 5000;

export type ParsedFlexReport =
  | {
      ok: true;
      /** Trade rows kept (execution level), as attribute maps. */
      trades: Record<string, string>[];
      accountIds: string[];
      /** Summary / order / lot lines left out so nothing is counted twice. */
      ignoredSummaryLines: number;
    }
  | { ok: false; message: string };

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, h: string) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_, d: string) => safeChar(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function safeChar(code: number): string {
  try {
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  } catch {
    return "";
  }
}

function readAttributes(tagBody: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tagBody)) !== null) {
    attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? "");
  }
  return attrs;
}

/** Read the report XML. Never throws. */
export function parseFlexReport(xml: string): ParsedFlexReport {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    return { ok: false, message: UNREADABLE_MESSAGE };
  }
  if (!/<FlexQueryResponse\b/.test(xml)) {
    return { ok: false, message: UNREADABLE_MESSAGE };
  }
  // The report must have a Trades section (even an empty one), or the query
  // is not the kind we expect.
  if (!/<Trades\b/.test(xml)) {
    return { ok: false, message: LAYOUT_MESSAGE };
  }

  const kept: Record<string, string>[] = [];
  let ignored = 0;
  const tradeTag = /<Trade\s([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tradeTag.exec(xml)) !== null) {
    const attrs = readAttributes(m[1]);
    const level = attrs.levelOfDetail;
    if (level === undefined || level === "" || level.toUpperCase() === "EXECUTION") {
      kept.push(attrs);
    } else {
      ignored += 1;
    }
  }

  if (kept.length === 0 && ignored > 0) {
    return {
      ok: false,
      message:
        "Your query includes summary lines instead of individual trades. In the query, tick Executions only.",
    };
  }

  // The safety net for the layout: every kept trade must carry the fields the
  // preset needs. A report that does not is refused whole, never read loosely.
  const missing = new Set<string>();
  for (const trade of kept) {
    for (const column of FLEX_COLUMNS) {
      if (!column.required) continue;
      if (!column.attributes.some((a) => trade[a] !== undefined)) missing.add(column.attributes[0]);
    }
  }
  if (missing.size > 0) {
    return {
      ok: false,
      message: `Interactive Brokers sent a report that is missing these fields: ${[...missing].join(", ")}. In the query, tick them and try again. Nothing was added.`,
    };
  }

  const accountIds: string[] = [];
  for (const trade of kept) {
    const id = trade.accountId;
    if (id && !accountIds.includes(id)) accountIds.push(id);
  }
  return { ok: true, trades: kept, accountIds, ignoredSummaryLines: ignored };
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Layout B CSV text for the kept trades (header + one line per trade). */
export function tradesToCsv(trades: Record<string, string>[]): string {
  const header = FLEX_COLUMNS.map((c) => csvCell(c.header)).join(",");
  const lines = trades.map((trade) =>
    FLEX_COLUMNS.map((column) => {
      const attr = column.attributes.find((a) => trade[a] !== undefined && trade[a] !== "");
      return csvCell(attr ? trade[attr] : "");
    }).join(","),
  );
  return [header, ...lines].join("\n");
}

export type AdaptedReport =
  | { ok: true; read: ReadOk | null; accountIds: string[]; ignoredSummaryLines: number; tradeCount: number }
  | { ok: false; message: string };

/** Report XML -> the Step 4a preset's own result (null read = no trades). */
export function adaptFlexReport(xml: string): AdaptedReport {
  const parsed = parseFlexReport(xml);
  if (!parsed.ok) return parsed;
  if (parsed.trades.length > MAX_REPORT_TRADES) {
    return {
      ok: false,
      message:
        "This report has more than 5,000 trades. In IBKR, shorten the query's period and try again.",
    };
  }
  if (parsed.trades.length === 0) {
    return {
      ok: true,
      read: null,
      accountIds: parsed.accountIds,
      ignoredSummaryLines: parsed.ignoredSummaryLines,
      tradeCount: 0,
    };
  }
  const read = readBrokerFile("ibkr", tradesToCsv(parsed.trades));
  if (!read.ok) return { ok: false, message: LAYOUT_MESSAGE };
  return {
    ok: true,
    read,
    accountIds: parsed.accountIds,
    ignoredSummaryLines: parsed.ignoredSummaryLines,
    tradeCount: parsed.trades.length,
  };
}

// Interactive Brokers: Activity Statement CSV [Beta] and Flex query CSV.
//
// Layout A, Activity Statement: one multi-section file. Every line starts
// with a section name, then Header / Data / SubTotal / Total. Only the
// sections listed below are read; every other section is ignored as a group.
// Columns inside a section are matched by NAME from that section's Header
// line. The section layout is confirmed; the exact column lists are not yet
// checked against a real file, which is why this layout ships as Beta.
//
// Layout B, Flex query (trades only): a plain header row with the fields the
// person ticked. Field names are confirmed. Columns are matched by name,
// never by position; quantity is unsigned and Buy/Sell gives the direction.

import { translateExchange } from "./exchange-map";
import {
  absDecimal,
  at,
  cannotReadRow,
  cashAmount,
  currencyProblem,
  currencySkipRow,
  feeMismatchNote,
  isBlankRecord,
  isRepeatOfHeader,
  locateHeader,
  matchColumns,
  normWord,
  pairKeyFor,
  rawLine,
  readDate,
  readFee,
  readPositive,
  readRequired,
  readyRow,
  signOf,
  skipRow,
  unknownWordRow,
  type ColSpec,
} from "./shared";
import type {
  DraftRead,
  PendingWithholding,
  PresetDefinition,
  RowOutcome,
  Table,
  TableRecord,
} from "./types";

const NAME = "Interactive Brokers";

const OPTION = "Options contract: InvestIQ tracks shares and funds only";
const CORPORATE_ACTION =
  "Corporate action (for example a split or merger): not supported yet, add the resulting shares by hand";
const SPLIT = "Stock split: not supported yet, add the resulting shares by hand";

// --- Layout B: Flex ---------------------------------------------------------

const FLEX_SPECS: ColSpec[] = [
  { key: "currency", names: ["CurrencyPrimary"], required: true },
  { key: "assetClass", names: ["AssetClass"], required: true },
  { key: "symbol", names: ["Symbol"], required: true },
  { key: "date", names: ["TradeDate"], required: true },
  { key: "side", names: ["Buy/Sell"], required: true },
  { key: "quantity", names: ["Quantity"], required: true },
  { key: "price", names: ["TradePrice"], required: true },
  { key: "commission", names: ["IBCommission"] },
  { key: "commissionCurrency", names: ["IBCommissionCurrency"] },
  { key: "id", names: ["TransactionID"] },
  { key: "exchange", names: ["ListingExchange", "Exchange"] },
];

function readFlexDate(text: string) {
  const a = readDate(text, "YYYYMMDD");
  return a.ok ? a : readDate(text, "YYYY-MM-DD");
}

function readFlex(table: Table): DraftRead {
  const outcomes: RowOutcome[] = [];
  let ignoredLines = 0;
  const loc = locateHeader(table, FLEX_SPECS);
  if (!loc.ok) {
    return { outcomes, withholdings: [], ignoredLines, ignoredSections: [], accountCount: 0, layout: "flex" };
  }
  const { cols } = loc;
  const header = table.records[loc.index].cells;
  ignoredLines += table.records.slice(0, loc.index).length;

  for (let i = loc.index + 1; i < table.records.length; i++) {
    const rec = table.records[i];
    const c = rec.cells;
    if (isBlankRecord(c) || isRepeatOfHeader(c, header)) {
      ignoredLines += 1;
      continue;
    }

    // Check 2: Buy/Sell word.
    const sideText = at(c, cols.side);
    const side = normWord(sideText);
    if (side !== "buy" && side !== "sell") {
      outcomes.push(unknownWordRow(rec, sideText));
      continue;
    }

    // Check 3: asset kind (stocks only).
    const assetClass = at(c, cols.assetClass);
    if (normWord(assetClass) !== "stk") {
      const cls = assetClass.toUpperCase();
      outcomes.push(
        cls === "OPT" || cls === "FOP"
          ? skipRow(rec, "option", OPTION)
          : skipRow(rec, "asset_kind", `${assetClass || "This asset type"}: InvestIQ tracks shares and funds only`),
      );
      continue;
    }

    // Check 4: currency.
    const currency = at(c, cols.currency).toUpperCase();
    if (currencyProblem(currency)) {
      outcomes.push(currencySkipRow(rec, currency));
      continue;
    }

    // Check 5: values.
    const ticker = at(c, cols.symbol);
    if (!ticker) {
      outcomes.push(cannotReadRow(rec, `Type '${side.toUpperCase()}' requires a Ticker.`));
      continue;
    }
    const when = readFlexDate(at(c, cols.date));
    if (!when.ok) {
      outcomes.push(cannotReadRow(rec, "Enter a valid trade date."));
      continue;
    }
    const qty = readPositive(at(c, cols.quantity), "us", "quantity", { absolute: true });
    if (!qty.ok) {
      outcomes.push(cannotReadRow(rec, qty.reason));
      continue;
    }
    const price = readPositive(at(c, cols.price), "us", "price");
    if (!price.ok) {
      outcomes.push(cannotReadRow(rec, price.reason));
      continue;
    }
    const commission = readFee(at(c, cols.commission), "us");
    if (!commission.ok) {
      outcomes.push(cannotReadRow(rec, commission.reason));
      continue;
    }
    let fee = commission.value;
    let importNote: string | undefined;
    if (signOf(fee) === 1) {
      const feeCurrency = (at(c, cols.commissionCurrency) || currency).toUpperCase();
      if (feeCurrency !== currency) {
        importNote = feeMismatchNote(fee, feeCurrency);
        fee = "0";
      }
    }

    outcomes.push(
      readyRow({
        rec,
        brokerName: NAME,
        type: side === "buy" ? "BUY" : "SELL",
        ticker,
        market: translateExchange(at(c, cols.exchange)),
        quantity: qty.value,
        price: price.value,
        currency,
        fee,
        date: when.date,
        importNote,
        stableId: at(c, cols.id) || undefined,
      }),
    );
  }

  return { outcomes, withholdings: [], ignoredLines, ignoredSections: [], accountCount: 0, layout: "flex" };
}

// --- Layout A: Activity Statement ----------------------------------------------

type SectionSpec = { specs: ColSpec[] };

const SECTIONS: Record<string, SectionSpec> = {
  Trades: {
    specs: [
      { key: "discriminator", names: ["DataDiscriminator"], required: true },
      { key: "assetCategory", names: ["Asset Category"], required: true },
      { key: "currency", names: ["Currency"], required: true },
      { key: "symbol", names: ["Symbol"], required: true },
      { key: "dateTime", names: ["Date/Time"], required: true },
      { key: "quantity", names: ["Quantity"], required: true },
      { key: "price", names: ["T. Price"], required: true },
      { key: "commission", names: ["Comm/Fee"] },
      { key: "exchange", names: ["Exchange"] },
    ],
  },
  "Deposits & Withdrawals": {
    specs: [
      { key: "currency", names: ["Currency"], required: true },
      { key: "date", names: ["Settle Date"], required: true },
      { key: "amount", names: ["Amount"], required: true },
    ],
  },
  Dividends: {
    specs: [
      { key: "currency", names: ["Currency"], required: true },
      { key: "date", names: ["Date"], required: true },
      { key: "description", names: ["Description"], required: true },
      { key: "amount", names: ["Amount"], required: true },
    ],
  },
  "Withholding Tax": {
    specs: [
      { key: "currency", names: ["Currency"], required: true },
      { key: "date", names: ["Date"], required: true },
      { key: "description", names: ["Description"], required: true },
      { key: "amount", names: ["Amount"], required: true },
    ],
  },
  Fees: {
    specs: [
      { key: "subtitle", names: ["Subtitle"] },
      { key: "currency", names: ["Currency"], required: true },
      { key: "date", names: ["Date"], required: true },
      { key: "amount", names: ["Amount"], required: true },
    ],
  },
  Interest: {
    specs: [
      { key: "currency", names: ["Currency"], required: true },
      { key: "date", names: ["Date"], required: true },
    ],
  },
  "Corporate Actions": {
    specs: [
      { key: "description", names: ["Description"] },
      { key: "dateTime", names: ["Date/Time"] },
    ],
  },
};

/** Section header lines present in the file (name -> its Header record index). */
function findSectionHeaders(table: Table): Map<string, number> {
  const found = new Map<string, number>();
  table.records.forEach((rec, index) => {
    const section = rec.cells[0] ?? "";
    if (normWord(rec.cells[1] ?? "") === "header" && SECTIONS[section] && !found.has(section)) {
      found.set(section, index);
    }
  });
  return found;
}

function activityMissing(table: Table): { found: boolean; missing: string[] } {
  const headers = findSectionHeaders(table);
  if (headers.size === 0) return { found: false, missing: [] };
  const missing: string[] = [];
  for (const [section, index] of headers) {
    const specs = SECTIONS[section].specs;
    const cols = matchColumns(table.records[index].cells.slice(2), specs);
    for (const spec of specs) {
      if (spec.required && cols[spec.key] === undefined) {
        missing.push(`${spec.names[0]} (in the ${section} section)`);
      }
    }
  }
  return { found: true, missing };
}

/** "AAPL(US0378331005) Cash Dividend ..." -> "AAPL". */
function tickerFromDescription(description: string): string | null {
  const m = /^([A-Za-z0-9.\-_]+)\s*\(([A-Za-z0-9]+)\)/.exec(description.trim());
  return m ? m[1] : null;
}

function isTotalCell(value: string): boolean {
  return normWord(value).startsWith("total");
}

function readActivity(table: Table): DraftRead {
  const outcomes: RowOutcome[] = [];
  const withholdings: PendingWithholding[] = [];
  let ignoredLines = 0;
  const ignoredSections = new Set<string>();
  // Per-section column maps, rebuilt at each section Header line.
  const colMaps = new Map<string, Record<string, number | undefined>>();

  for (const rec of table.records) {
    const section = rec.cells[0] ?? "";
    const kind = normWord(rec.cells[1] ?? "");
    const spec = SECTIONS[section];

    if (!spec) {
      // A section we do not read: ignored as a group.
      if (section !== "") ignoredSections.add(section);
      ignoredLines += 1;
      continue;
    }
    if (kind === "header") {
      colMaps.set(section, matchColumns(rec.cells.slice(2), spec.specs));
      continue;
    }
    if (kind === "subtotal" || kind === "total") {
      ignoredLines += 1;
      continue;
    }
    if (kind !== "data") {
      ignoredLines += 1;
      continue;
    }
    const cols = colMaps.get(section);
    if (!cols) {
      ignoredLines += 1;
      continue;
    }
    // Data cells start after the section name and the "Data" marker.
    const data: TableRecord = { line: rec.line, cells: rec.cells.slice(2) };
    const c = data.cells;
    // The original full line is what we show as the raw line.
    const showRec: TableRecord = { line: rec.line, cells: rec.cells };

    if (section === "Trades") {
      const disc = at(c, cols.discriminator);
      const discWord = normWord(disc);
      if (discWord === "closedlot" || discWord === "lot" || discWord === "closed lot") {
        ignoredLines += 1;
        continue;
      }
      if (discWord !== "order") {
        outcomes.push(unknownWordRow(showRec, disc));
        continue;
      }
      const category = at(c, cols.assetCategory);
      if (normWord(category) !== "stocks") {
        outcomes.push(
          /option/i.test(category)
            ? skipRow(showRec, "option", OPTION)
            : skipRow(showRec, "asset_kind", `${category || "This asset type"}: InvestIQ tracks shares and funds only`),
        );
        continue;
      }
      const currency = at(c, cols.currency).toUpperCase();
      if (currencyProblem(currency)) {
        outcomes.push(currencySkipRow(showRec, currency));
        continue;
      }
      const ticker = at(c, cols.symbol);
      if (!ticker) {
        outcomes.push(cannotReadRow(showRec, "Type 'TRADE' requires a Ticker."));
        continue;
      }
      const when = readDate(at(c, cols.dateTime), "YYYY-MM-DD", true);
      if (!when.ok) {
        outcomes.push(cannotReadRow(showRec, "Enter a valid trade date."));
        continue;
      }
      const qty = readRequired(at(c, cols.quantity), "us", "quantity");
      if (!qty.ok) {
        outcomes.push(cannotReadRow(showRec, qty.reason));
        continue;
      }
      const direction = signOf(qty.value);
      if (direction === 0) {
        outcomes.push(cannotReadRow(showRec, "Quantity must be greater than zero."));
        continue;
      }
      const price = readPositive(at(c, cols.price), "us", "price");
      if (!price.ok) {
        outcomes.push(cannotReadRow(showRec, price.reason));
        continue;
      }
      const fee = readFee(at(c, cols.commission), "us");
      if (!fee.ok) {
        outcomes.push(cannotReadRow(showRec, fee.reason));
        continue;
      }
      outcomes.push(
        readyRow({
          rec: showRec,
          brokerName: NAME,
          type: direction === 1 ? "BUY" : "SELL",
          ticker,
          market: translateExchange(at(c, cols.exchange)),
          quantity: absDecimal(qty.value),
          price: price.value,
          currency,
          fee: fee.value,
          date: when.date,
          sortTime: when.time,
        }),
      );
      continue;
    }

    if (section === "Corporate Actions") {
      const description = at(c, cols.description);
      outcomes.push(
        /split/i.test(description) ? skipRow(showRec, "split", SPLIT) : skipRow(showRec, "corporate_action", CORPORATE_ACTION),
      );
      continue;
    }

    // The money sections: a "Total" line inside them is a summary, not a transaction.
    if (isTotalCell(at(c, cols.currency)) || isTotalCell(at(c, cols.subtitle))) {
      ignoredLines += 1;
      continue;
    }

    if (section === "Interest") {
      outcomes.push(skipRow(showRec, "interest", "Interest paid on cash is not tracked yet"));
      continue;
    }

    const currency = at(c, cols.currency).toUpperCase();
    if (currencyProblem(currency)) {
      outcomes.push(currencySkipRow(showRec, currency));
      continue;
    }
    const when = readDate(at(c, cols.date), "YYYY-MM-DD");
    if (!when.ok) {
      outcomes.push(cannotReadRow(showRec, "Enter a valid trade date."));
      continue;
    }
    const amount = readRequired(at(c, cols.amount), "us", "amount");
    if (!amount.ok) {
      outcomes.push(cannotReadRow(showRec, amount.reason));
      continue;
    }
    const sign = signOf(amount.value);

    if (section === "Deposits & Withdrawals") {
      const type = sign === -1 ? "WITHDRAWAL" : "DEPOSIT";
      const cash = cashAmount(type, amount.value);
      if (!cash.ok) {
        outcomes.push(cannotReadRow(showRec, cash.reason));
        continue;
      }
      outcomes.push(
        readyRow({ rec: showRec, brokerName: NAME, type, amount: cash.amount, currency, date: when.date }),
      );
      continue;
    }

    if (section === "Fees") {
      if (sign === 1) {
        outcomes.push(skipRow(showRec, "fee_refund", "A refunded fee is not tracked yet"));
        continue;
      }
      if (sign === 0) {
        outcomes.push(cannotReadRow(showRec, "Amount must be greater than zero."));
        continue;
      }
      outcomes.push(
        readyRow({
          rec: showRec,
          brokerName: NAME,
          type: "FEE",
          amount: absDecimal(amount.value),
          currency,
          date: when.date,
        }),
      );
      continue;
    }

    // Dividends and Withholding Tax: the ticker is at the start of the description.
    const description = at(c, cols.description);
    const ticker = tickerFromDescription(description);
    if (!ticker) {
      outcomes.push(skipRow(showRec, "unclear", "We could not tell which stock this line belongs to, so we left it out"));
      continue;
    }

    if (section === "Dividends") {
      if (!/cash dividend/i.test(description)) {
        outcomes.push(
          skipRow(showRec, "unsupported_type", "This kind of dividend payment is not recognised yet, so we left it out"),
        );
        continue;
      }
      if ((sign ?? 0) <= 0) {
        outcomes.push(skipRow(showRec, "reversal", "Dividend reversal or zero dividend: not supported yet"));
        continue;
      }
      outcomes.push(
        readyRow({
          rec: showRec,
          brokerName: NAME,
          type: "DIVIDEND",
          ticker,
          amount: amount.value,
          currency,
          fee: "0",
          date: when.date,
          pairKey: pairKeyFor(ticker, when.date, currency),
        }),
      );
      continue;
    }

    // Withholding Tax.
    if (sign === 1) {
      outcomes.push(skipRow(showRec, "tax_refund", "A tax refund or adjustment is not tracked yet"));
      continue;
    }
    if (sign === 0) {
      outcomes.push(cannotReadRow(showRec, "Amount must be greater than zero."));
      continue;
    }
    withholdings.push({
      line: rec.line,
      raw: rawLine(rec.cells),
      key: pairKeyFor(ticker, when.date, currency),
      amount: absDecimal(amount.value),
      currency,
      ticker,
      tradeDate: when.date,
    });
  }

  return {
    outcomes,
    withholdings,
    ignoredLines,
    ignoredSections: [...ignoredSections],
    accountCount: 0,
    layout: "activity",
  };
}

// --- The preset -----------------------------------------------------------------

function isActivity(table: Table): boolean {
  return findSectionHeaders(table).size > 0;
}

export const ibkr: PresetDefinition = {
  id: "ibkr",
  name: NAME,
  // The Flex layout is confirmed; only the Activity Statement layout is Beta
  // (the result carries `layout` so the screen can say which).
  beta: false,
  order: "oldest",
  headerExample:
    '"ClientAccountID","CurrencyPrimary","AssetClass","Symbol","ISIN","TradeDate","Buy/Sell","Quantity","TradePrice","IBCommission","IBCommissionCurrency","TransactionID"',
  check(table) {
    const activity = activityMissing(table);
    if (activity.found) {
      return activity.missing.length === 0 ? { ok: true } : { ok: false, missing: activity.missing };
    }
    const flex = locateHeader(table, FLEX_SPECS);
    return flex.ok ? { ok: true } : { ok: false, missing: flex.missing };
  },
  read(table) {
    return isActivity(table) ? readActivity(table) : readFlex(table);
  },
};

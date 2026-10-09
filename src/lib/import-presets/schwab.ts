// Charles Schwab transaction-history CSV.
//
// A title line sits above the header and a "Transactions Total" line below
// the last row; the file lists newest first. Dates are MM/DD/YYYY (month
// first, never guessed). A date written "03/15/2026 as of 03/14/2026" is read
// as the FIRST (posted) date, a decision recorded in the spec. Numbers look
// like "$2,054.00" and "-$12.00". The file has no currency column, so amounts
// are read as US dollars (the screen says so).

import {
  at,
  cannotReadRow,
  cashAmount,
  currencyProblem,
  currencySkipRow,
  isBlankRecord,
  isRepeatOfHeader,
  locateHeader,
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
  absDecimal,
  type ColSpec,
} from "./shared";
import type {
  DraftRead,
  PendingWithholding,
  PresetDefinition,
  RowOutcome,
  SkipCode,
  Table,
} from "./types";

const NAME = "Charles Schwab";
const CURRENCY = "USD";

const SPECS: ColSpec[] = [
  { key: "date", names: ["Date"], required: true },
  { key: "action", names: ["Action"], required: true },
  { key: "symbol", names: ["Symbol"], required: true },
  { key: "quantity", names: ["Quantity"], required: true },
  { key: "price", names: ["Price"], required: true },
  { key: "amount", names: ["Amount"], required: true },
  { key: "description", names: ["Description"] },
  { key: "fees", names: ["Fees & Comm", "Fees and Comm"] },
];

type Entry =
  | { kind: "BUY" | "SELL" | "DIVIDEND" | "TAX" | "CASH" }
  | { kind: "SKIP"; code: SkipCode; reason: string };

const OPTION = "Options contract: InvestIQ tracks shares and funds only";
const REINVEST = "Dividend reinvestment: not supported yet";

const ACTIONS: Record<string, Entry> = {
  buy: { kind: "BUY" },
  sell: { kind: "SELL" },
  "qualified dividend": { kind: "DIVIDEND" },
  "cash dividend": { kind: "DIVIDEND" },
  "non-qualified div": { kind: "DIVIDEND" },
  "non-qual div": { kind: "DIVIDEND" },
  "foreign tax paid": { kind: "TAX" },
  "foreign tax": { kind: "TAX" },
  "nra tax adj": { kind: "TAX" },
  "moneylink transfer": { kind: "CASH" },
  "wire funds received": { kind: "CASH" },
  "wire funds": { kind: "CASH" },
  journal: { kind: "SKIP", code: "transfer", reason: "Move between your own accounts: not tracked yet" },
  "bank interest": { kind: "SKIP", code: "interest", reason: "Interest paid on cash is not tracked yet" },
  "stock split": {
    kind: "SKIP",
    code: "split",
    reason: "Stock split: not supported yet, add the resulting shares by hand",
  },
  "reinvest shares": { kind: "SKIP", code: "reinvestment", reason: REINVEST },
  "reinvest dividend": { kind: "SKIP", code: "reinvestment", reason: REINVEST },
  "cash in lieu": { kind: "SKIP", code: "corporate_action", reason: "Cash paid instead of a part-share: not supported yet" },
  "service fee": { kind: "SKIP", code: "unsupported_type", reason: "Account service fees are not tracked yet" },
  "buy to open": { kind: "SKIP", code: "option", reason: OPTION },
  "sell to open": { kind: "SKIP", code: "option", reason: OPTION },
  "sell to close": { kind: "SKIP", code: "option", reason: OPTION },
  "buy to close": { kind: "SKIP", code: "option", reason: OPTION },
  expired: { kind: "SKIP", code: "option", reason: OPTION },
  assigned: { kind: "SKIP", code: "option", reason: OPTION },
};

const PLAIN_SYMBOL = /^[A-Za-z0-9.\-]+$/;

/** The posted date: the first date when the cell says "... as of ...". */
function postedDate(text: string): string {
  const m = /^(.*?)\s+as of\s+.*$/i.exec(text.trim());
  return m ? m[1] : text;
}

function read(table: Table): DraftRead {
  const outcomes: RowOutcome[] = [];
  const withholdings: PendingWithholding[] = [];
  let ignoredLines = 0;
  const loc = locateHeader(table, SPECS);
  if (!loc.ok) return { outcomes, withholdings, ignoredLines, ignoredSections: [], accountCount: 0 };
  const { cols } = loc;
  const header = table.records[loc.index].cells;

  // Title lines above the header are structural.
  ignoredLines += table.records.slice(0, loc.index).length;

  for (let i = loc.index + 1; i < table.records.length; i++) {
    const rec = table.records[i];
    const c = rec.cells;
    const filled = c.filter((x) => x !== "").length;
    if (
      isBlankRecord(c) ||
      isRepeatOfHeader(c, header) ||
      filled <= 1 ||
      /^transactions total\b/i.test(c[0] ?? "")
    ) {
      ignoredLines += 1;
      continue;
    }

    // Check 2: the action word.
    const actionText = at(c, cols.action);
    const entry = ACTIONS[normWord(actionText)];
    if (!entry) {
      outcomes.push(unknownWordRow(rec, actionText));
      continue;
    }
    if (entry.kind === "SKIP") {
      outcomes.push(skipRow(rec, entry.code, entry.reason));
      continue;
    }

    const symbol = at(c, cols.symbol);

    // Check 3: asset kind (options show up with spaces in the symbol).
    if ((entry.kind === "BUY" || entry.kind === "SELL") && !PLAIN_SYMBOL.test(symbol)) {
      outcomes.push(
        symbol.includes(" ")
          ? skipRow(rec, "option", OPTION)
          : skipRow(rec, "asset_kind", "This does not look like a share or fund ticker, so we left it out"),
      );
      continue;
    }

    // Check 4: currency (fixed: Schwab files are read as US dollars).
    if (currencyProblem(CURRENCY)) {
      outcomes.push(currencySkipRow(rec, CURRENCY));
      continue;
    }

    // Check 5: values.
    const when = readDate(postedDate(at(c, cols.date)), "MM/DD/YYYY");
    if (!when.ok) {
      outcomes.push(cannotReadRow(rec, "Enter a valid trade date."));
      continue;
    }

    if (entry.kind === "BUY" || entry.kind === "SELL") {
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
      const fee = readFee(at(c, cols.fees), "us");
      if (!fee.ok) {
        outcomes.push(cannotReadRow(rec, fee.reason));
        continue;
      }
      outcomes.push(
        readyRow({
          rec,
          brokerName: NAME,
          type: entry.kind,
          ticker: symbol,
          quantity: qty.value,
          price: price.value,
          currency: CURRENCY,
          fee: fee.value,
          date: when.date,
        }),
      );
      continue;
    }

    if (entry.kind === "DIVIDEND") {
      if (!symbol) {
        outcomes.push(cannotReadRow(rec, "Type 'DIVIDEND' requires a Ticker."));
        continue;
      }
      const amount = readRequired(at(c, cols.amount), "us", "amount");
      if (!amount.ok) {
        outcomes.push(cannotReadRow(rec, amount.reason));
        continue;
      }
      if ((signOf(amount.value) ?? 0) <= 0) {
        outcomes.push(skipRow(rec, "reversal", "Dividend reversal or zero dividend: not supported yet"));
        continue;
      }
      outcomes.push(
        readyRow({
          rec,
          brokerName: NAME,
          type: "DIVIDEND",
          ticker: symbol,
          amount: amount.value,
          currency: CURRENCY,
          fee: "0",
          date: when.date,
          pairKey: pairKeyFor(symbol, when.date, CURRENCY),
        }),
      );
      continue;
    }

    if (entry.kind === "TAX") {
      const amount = readRequired(at(c, cols.amount), "us", "amount");
      if (!amount.ok) {
        outcomes.push(cannotReadRow(rec, amount.reason));
        continue;
      }
      const sign = signOf(amount.value);
      if (sign === 1) {
        outcomes.push(skipRow(rec, "tax_refund", "A tax refund or adjustment is not tracked yet"));
        continue;
      }
      if (sign === 0) {
        outcomes.push(cannotReadRow(rec, "Amount must be greater than zero."));
        continue;
      }
      if (!symbol) {
        outcomes.push(skipRow(rec, "unclear", "This tax line names no stock, so we could not tell what it belongs to"));
        continue;
      }
      withholdings.push({
        line: rec.line,
        raw: rawLine(c),
        key: pairKeyFor(symbol, when.date, CURRENCY),
        amount: absDecimal(amount.value),
        currency: CURRENCY,
        ticker: symbol,
        tradeDate: when.date,
      });
      continue;
    }

    // CASH: direction from the sign of the amount.
    const amount = readRequired(at(c, cols.amount), "us", "amount");
    if (!amount.ok) {
      outcomes.push(cannotReadRow(rec, amount.reason));
      continue;
    }
    const sign = signOf(amount.value);
    const type = sign === -1 ? "WITHDRAWAL" : "DEPOSIT";
    const cash = cashAmount(type, amount.value);
    if (!cash.ok) {
      outcomes.push(cannotReadRow(rec, cash.reason));
      continue;
    }
    outcomes.push(
      readyRow({
        rec,
        brokerName: NAME,
        type,
        amount: cash.amount,
        currency: CURRENCY,
        date: when.date,
      }),
    );
  }

  return { outcomes, withholdings, ignoredLines, ignoredSections: [], accountCount: 0 };
}

export const schwab: PresetDefinition = {
  id: "schwab",
  name: NAME,
  beta: false,
  fixedCurrency: { code: CURRENCY, label: "US dollars" },
  order: "detect-newest",
  headerExample: "Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount",
  check(table) {
    const loc = locateHeader(table, SPECS);
    return loc.ok ? { ok: true } : { ok: false, missing: loc.missing };
  },
  read,
};

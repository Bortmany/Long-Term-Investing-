// Fidelity "Activity and orders" history CSV. [Beta]
//
// Two header versions exist and both are accepted (columns matched by name):
// the current one has a Currency column; the older one has "($)" headers and
// no currency column, so amounts are read as US dollars (the screen says so).
// The file starts with blank lines, ends with disclaimer lines and lists
// newest first. Dates are MM/DD/YYYY from "Run Date". Actions are matched by
// their starting phrase, case-insensitively, after trimming.

import {
  addDecimals,
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

const NAME = "Fidelity";
const ASSUMED = { code: "USD", label: "US dollars" };

const SPECS: ColSpec[] = [
  { key: "date", names: ["Run Date"], required: true },
  { key: "action", names: ["Action"], required: true },
  { key: "symbol", names: ["Symbol"], required: true },
  { key: "quantity", names: ["Quantity"], required: true },
  { key: "price", names: ["Price", "Price ($)"], required: true },
  { key: "amount", names: ["Amount", "Amount ($)"], required: true },
  { key: "commission", names: ["Commission", "Commission ($)"] },
  { key: "fees", names: ["Fees", "Fees ($)"] },
  { key: "currency", names: ["Currency"] },
  { key: "account", names: ["Account"] },
  { key: "accountNumber", names: ["Account Number"] },
];

type Entry =
  | { kind: "BUY" | "SELL" | "DIVIDEND" | "TAX" | "DEPOSIT" | "WITHDRAWAL" | "FEE" }
  | { kind: "SKIP"; code: SkipCode; reason: string };

// Matched by starting phrase; longest phrases are tried first.
const PHRASES: [string, Entry][] = [
  ["you bought", { kind: "BUY" }],
  ["you sold", { kind: "SELL" }],
  ["dividend received", { kind: "DIVIDEND" }],
  ["non-resident tax", { kind: "TAX" }],
  ["foreign tax paid", { kind: "TAX" }],
  ["electronic funds transfer received", { kind: "DEPOSIT" }],
  ["electronic funds transfer paid", { kind: "WITHDRAWAL" }],
  ["wire transfer out", { kind: "WITHDRAWAL" }],
  ["fee charged", { kind: "FEE" }],
  ["reinvestment", { kind: "SKIP", code: "reinvestment", reason: "Dividend reinvestment: not supported yet" }],
  [
    "stock split",
    { kind: "SKIP", code: "split", reason: "Stock split: not supported yet, add the resulting shares by hand" },
  ],
  [
    "transferred",
    { kind: "SKIP", code: "transfer", reason: "Shares moved in or out of another account: add them by hand" },
  ],
  ["interest earned", { kind: "SKIP", code: "interest", reason: "Interest paid on cash is not tracked yet" }],
].sort((a, b) => (b[0] as string).length - (a[0] as string).length) as [string, Entry][];

const PLAIN_SYMBOL = /^[A-Za-z0-9.\-]+$/;

function lookup(actionText: string): Entry | undefined {
  const word = normWord(actionText);
  for (const [phrase, entry] of PHRASES) {
    if (word.startsWith(phrase)) return entry;
  }
  return undefined;
}

function read(table: Table): DraftRead {
  const outcomes: RowOutcome[] = [];
  const withholdings: PendingWithholding[] = [];
  let ignoredLines = 0;
  const accounts = new Set<string>();
  const loc = locateHeader(table, SPECS);
  if (!loc.ok) return { outcomes, withholdings, ignoredLines, ignoredSections: [], accountCount: 0 };
  const { cols } = loc;
  const header = table.records[loc.index].cells;
  const hasCurrencyColumn = cols.currency !== undefined;

  ignoredLines += table.records.slice(0, loc.index).length;

  for (let i = loc.index + 1; i < table.records.length; i++) {
    const rec = table.records[i];
    const c = rec.cells;
    const filled = c.filter((x) => x !== "").length;
    // Disclaimer and "Date downloaded" lines are single quoted cells.
    if (isBlankRecord(c) || isRepeatOfHeader(c, header) || filled <= 1) {
      ignoredLines += 1;
      continue;
    }

    const acct = at(c, cols.accountNumber) || at(c, cols.account);
    if (acct) accounts.add(acct);

    // Check 2: the action phrase.
    const actionText = at(c, cols.action);
    const entry = lookup(actionText);
    if (!entry) {
      outcomes.push(unknownWordRow(rec, actionText));
      continue;
    }
    if (entry.kind === "SKIP") {
      outcomes.push(skipRow(rec, entry.code, entry.reason));
      continue;
    }

    const symbol = at(c, cols.symbol);

    // Check 3: asset kind (option symbols start with "-", or the action says so).
    if (entry.kind === "BUY" || entry.kind === "SELL") {
      if (
        /opening transaction|closing transaction/i.test(actionText) ||
        symbol.startsWith("-")
      ) {
        outcomes.push(skipRow(rec, "option", "Options contract: InvestIQ tracks shares and funds only"));
        continue;
      }
      if (!PLAIN_SYMBOL.test(symbol)) {
        outcomes.push(
          skipRow(rec, "asset_kind", "This does not look like a share or fund ticker, so we left it out"),
        );
        continue;
      }
    }

    // Check 4: currency (the Currency column, or US dollars for the older file).
    const currency = hasCurrencyColumn ? at(c, cols.currency).toUpperCase() : ASSUMED.code;
    if (currencyProblem(currency)) {
      outcomes.push(currencySkipRow(rec, currency));
      continue;
    }

    // Check 5: values.
    const when = readDate(at(c, cols.date), "MM/DD/YYYY");
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
      const commission = readFee(at(c, cols.commission), "us");
      const otherFees = readFee(at(c, cols.fees), "us");
      if (!commission.ok || !otherFees.ok) {
        outcomes.push(cannotReadRow(rec, "Enter the fee as a number."));
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
          currency,
          fee: addDecimals(commission.value, otherFees.value) ?? "0",
          date: when.date,
        }),
      );
      continue;
    }

    const amount = readRequired(at(c, cols.amount), "us", "amount");
    if (!amount.ok) {
      outcomes.push(cannotReadRow(rec, amount.reason));
      continue;
    }
    const sign = signOf(amount.value);

    if (entry.kind === "DIVIDEND") {
      if (!symbol) {
        outcomes.push(cannotReadRow(rec, "Type 'DIVIDEND' requires a Ticker."));
        continue;
      }
      if ((sign ?? 0) <= 0) {
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
          currency,
          fee: "0",
          date: when.date,
          pairKey: pairKeyFor(symbol, when.date, currency),
        }),
      );
      continue;
    }

    if (entry.kind === "TAX") {
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
        key: pairKeyFor(symbol, when.date, currency),
        amount: absDecimal(amount.value),
        currency,
        ticker: symbol,
        tradeDate: when.date,
      });
      continue;
    }

    if (entry.kind === "FEE") {
      if (sign === 1) {
        outcomes.push(skipRow(rec, "fee_refund", "A refunded fee is not tracked yet"));
        continue;
      }
      if (sign === 0) {
        outcomes.push(cannotReadRow(rec, "Amount must be greater than zero."));
        continue;
      }
      outcomes.push(
        readyRow({
          rec,
          brokerName: NAME,
          type: "FEE",
          ticker: PLAIN_SYMBOL.test(symbol) ? symbol : undefined,
          amount: absDecimal(amount.value),
          currency,
          date: when.date,
        }),
      );
      continue;
    }

    // DEPOSIT / WITHDRAWAL: direction from the action words; the sign must agree.
    const cash = cashAmount(entry.kind, amount.value);
    if (!cash.ok) {
      outcomes.push(cash.skip ? skipRow(rec, "unclear", cash.reason) : cannotReadRow(rec, cash.reason));
      continue;
    }
    outcomes.push(
      readyRow({
        rec,
        brokerName: NAME,
        type: entry.kind,
        amount: cash.amount,
        currency,
        date: when.date,
      }),
    );
  }

  return {
    outcomes,
    withholdings,
    ignoredLines,
    ignoredSections: [],
    accountCount: accounts.size,
    currencyAssumed: hasCurrencyColumn ? undefined : ASSUMED,
  };
}

export const fidelity: PresetDefinition = {
  id: "fidelity",
  name: NAME,
  beta: true,
  order: "detect-newest",
  headerExample: "Run Date,Account,Action,Symbol,Security Description,Quantity,Price,Commission,Fees,Amount",
  check(table) {
    const loc = locateHeader(table, SPECS);
    return loc.ok ? { ok: true } : { ok: false, missing: loc.missing };
  },
  read,
};

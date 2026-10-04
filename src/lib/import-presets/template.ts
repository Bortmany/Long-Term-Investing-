// The InvestIQ template (for Gulf brokers and any broker without a preset).
//
// Our own format, fully specified:
//   Date,Ticker,Market,Type,Quantity,Price,Amount,Fee,Currency,Note
// - Date is YYYY-MM-DD only. Anything else is "cannot read: Use YYYY-MM-DD".
// - Type is Buy, Sell, Dividend, Deposit, Withdrawal or Fee (any capitals).
//   Any other word is skipped, never guessed.
// - Market is optional; when given it must be one of the app's real market
//   names (read at run time, see lists.ts).
// - Buy and Sell use Quantity and Price; the other types use Amount.
// - The person's own Note column is kept as the transaction's note (it is
//   their own words in our own template, unlike a broker's description text).

import { isRealMarket, realMarketNames } from "./lists";
import {
  at,
  cannotReadRow,
  currencyProblem,
  currencySkipRow,
  isBlankRecord,
  isRepeatOfHeader,
  locateHeader,
  normWord,
  readDate,
  readRequired,
  signOf,
  readPositive,
  readyRow,
  unknownWordRow,
  type ColSpec,
} from "./shared";
import type { DraftRead, PresetDefinition, RowOutcome, Table, TransactionTypeName } from "./types";

const NAME = "InvestIQ template";

const SPECS: ColSpec[] = [
  { key: "date", names: ["Date"], required: true },
  { key: "ticker", names: ["Ticker"], required: true },
  { key: "type", names: ["Type"], required: true },
  { key: "quantity", names: ["Quantity"], required: true },
  { key: "price", names: ["Price"], required: true },
  { key: "amount", names: ["Amount"], required: true },
  { key: "currency", names: ["Currency"], required: true },
  { key: "market", names: ["Market"] },
  { key: "fee", names: ["Fee"] },
  { key: "note", names: ["Note"] },
];

const TYPES: Record<string, TransactionTypeName> = {
  buy: "BUY",
  sell: "SELL",
  dividend: "DIVIDEND",
  deposit: "DEPOSIT",
  withdrawal: "WITHDRAWAL",
  fee: "FEE",
};

/** The template's Fee column: blank is 0, and a negative number is refused (not flipped). */
function readTemplateFee(text: string): { ok: true; value: string } | { ok: false; reason: string } {
  if (text === "") return { ok: true, value: "0" };
  const n = readRequired(text, "us", "fee");
  if (!n.ok) return n;
  if (signOf(n.value) === -1) return { ok: false, reason: "Fee cannot be negative." };
  return n;
}

function read(table: Table): DraftRead {
  const outcomes: RowOutcome[] = [];
  let ignoredLines = 0;
  const loc = locateHeader(table, SPECS);
  if (!loc.ok) return { outcomes, withholdings: [], ignoredLines, ignoredSections: [], accountCount: 0 };
  const { cols } = loc;
  const header = table.records[loc.index].cells;

  for (let i = loc.index + 1; i < table.records.length; i++) {
    const rec = table.records[i];
    const c = rec.cells;
    if (isBlankRecord(c) || isRepeatOfHeader(c, header)) {
      ignoredLines += 1;
      continue;
    }

    // Check 2: the type word.
    const typeText = at(c, cols.type);
    const type = TYPES[normWord(typeText)];
    if (!type) {
      outcomes.push(unknownWordRow(rec, typeText));
      continue;
    }

    // Check 4: currency (blank is left for the shared check to explain).
    const currency = at(c, cols.currency).toUpperCase();
    if (currency !== "" && currencyProblem(currency)) {
      outcomes.push(currencySkipRow(rec, currency));
      continue;
    }

    // Check 5: values.
    const when = readDate(at(c, cols.date), "YYYY-MM-DD");
    if (!when.ok) {
      outcomes.push(cannotReadRow(rec, "Enter a valid trade date. Use YYYY-MM-DD, for example 2026-03-14."));
      continue;
    }

    const marketText = at(c, cols.market);
    if (marketText !== "" && !isRealMarket(marketText)) {
      outcomes.push(
        cannotReadRow(rec, `Market '${marketText}' is not one we know. Use one of: ${realMarketNames().join(", ")}.`),
      );
      continue;
    }
    const market = marketText === "" ? undefined : marketText.toUpperCase();
    const ticker = at(c, cols.ticker);
    if ((type === "BUY" || type === "SELL" || type === "DIVIDEND") && !ticker) {
      outcomes.push(cannotReadRow(rec, `Type '${type}' requires a Ticker.`));
      continue;
    }

    const userNote = at(c, cols.note);
    const note = userNote !== "" ? userNote : undefined;
    const base = { rec, brokerName: NAME, type, ticker: ticker || undefined, market, currency: currency || undefined, date: when.date, note };

    if (type === "BUY" || type === "SELL") {
      const qty = readPositive(at(c, cols.quantity), "us", "quantity");
      if (!qty.ok) {
        outcomes.push(cannotReadRow(rec, qty.reason));
        continue;
      }
      const price = readPositive(at(c, cols.price), "us", "price");
      if (!price.ok) {
        outcomes.push(cannotReadRow(rec, price.reason));
        continue;
      }
      const fee = readTemplateFee(at(c, cols.fee));
      if (!fee.ok) {
        outcomes.push(cannotReadRow(rec, fee.reason));
        continue;
      }
      outcomes.push(readyRow({ ...base, quantity: qty.value, price: price.value, fee: fee.value }));
      continue;
    }

    const amount = readPositive(at(c, cols.amount), "us", "amount");
    if (!amount.ok) {
      outcomes.push(cannotReadRow(rec, amount.reason));
      continue;
    }
    if (type === "DIVIDEND") {
      const fee = readTemplateFee(at(c, cols.fee));
      if (!fee.ok) {
        outcomes.push(cannotReadRow(rec, fee.reason));
        continue;
      }
      outcomes.push(readyRow({ ...base, amount: amount.value, fee: fee.value }));
      continue;
    }
    // Deposit, withdrawal and fee entries carry an amount only.
    outcomes.push(readyRow({ ...base, amount: amount.value }));
  }

  return { outcomes, withholdings: [], ignoredLines, ignoredSections: [], accountCount: 0 };
}

export const template: PresetDefinition = {
  id: "template",
  name: NAME,
  beta: false,
  order: "detect-oldest",
  headerExample: "Date,Ticker,Market,Type,Quantity,Price,Amount,Fee,Currency,Note",
  check(table) {
    const loc = locateHeader(table, SPECS);
    return loc.ok ? { ok: true } : { ok: false, missing: loc.missing };
  },
  read,
};

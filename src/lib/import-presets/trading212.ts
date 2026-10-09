// Trading 212 History export.
//
// Columns are matched by NAME: the export varies (extra or missing optional
// columns, "Time" or "Time (UTC)"). The time can be "2023-12-18 14:30:03.613"
// (fractional seconds) or ISO 8601. The file is oldest first.
//
// Fee = stamp duty + currency-conversion fee + Finra fee, each counted only
// when it is in the trade currency; one in another currency is left out and
// the row is marked "imported with a note". A dividend row states the net
// amount and the tax separately, so gross = net + tax (same currency only).
// Profit ("Result") is never imported; InvestIQ works out its own.

import { translateExchange } from "./exchange-map";
import {
  addDecimals,
  at,
  cannotReadRow,
  cashAmount,
  currencyProblem,
  currencySkipRow,
  feeMismatchNote,
  feeUnknownCurrencyNote,
  isBlankRecord,
  isRepeatOfHeader,
  locateHeader,
  normWord,
  readDate,
  readNumber,
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
  PresetDefinition,
  RowOutcome,
  SkipCode,
  Table,
  TransactionTypeName,
} from "./types";

const NAME = "Trading 212";

const SPECS: ColSpec[] = [
  { key: "action", names: ["Action"], required: true },
  { key: "time", names: ["Time", "Time (UTC)"], required: true },
  { key: "ticker", names: ["Ticker"], required: true },
  { key: "shares", names: ["No. of shares"], required: true },
  { key: "price", names: ["Price / share"], required: true },
  { key: "priceCur", names: ["Currency (Price / share)"], required: true },
  { key: "total", names: ["Total"], required: true },
  { key: "totalCur", names: ["Currency (Total)"], required: true },
  { key: "id", names: ["ID"], required: true },
  // Optional: present in some exports only.
  { key: "withholding", names: ["Withholding tax"] },
  { key: "withholdingCur", names: ["Currency (Withholding tax)"] },
  { key: "stamp", names: ["Stamp duty reserve tax"] },
  { key: "stampCur", names: ["Currency (Stamp duty reserve tax)"] },
  { key: "conversion", names: ["Currency conversion fee"] },
  { key: "conversionCur", names: ["Currency (Currency conversion fee)"] },
  { key: "finra", names: ["Finra fee"] },
  { key: "finraCur", names: ["Currency (Finra fee)"] },
  { key: "exchange", names: ["Exchange"] },
];

type ActionEntry =
  | { type: Extract<TransactionTypeName, "BUY" | "SELL" | "DIVIDEND" | "DEPOSIT" | "WITHDRAWAL"> }
  | { skip: SkipCode; reason: string };

const INTEREST = "Interest paid on cash is not tracked yet";
const SPLIT = "Stock split: not supported yet, add the resulting shares by hand";

const ACTIONS: Record<string, ActionEntry> = {
  "market buy": { type: "BUY" },
  "limit buy": { type: "BUY" },
  "stop buy": { type: "BUY" },
  "stop limit buy": { type: "BUY" },
  "market sell": { type: "SELL" },
  "limit sell": { type: "SELL" },
  "stop sell": { type: "SELL" },
  "stop limit sell": { type: "SELL" },
  "dividend (ordinary)": { type: "DIVIDEND" },
  "dividend (bonus)": { type: "DIVIDEND" },
  "dividend (return of capital)": { type: "DIVIDEND" },
  "dividend (dividend manufactured payment)": { type: "DIVIDEND" },
  deposit: { type: "DEPOSIT" },
  withdrawal: { type: "WITHDRAWAL" },
  "interest on cash": { skip: "interest", reason: INTEREST },
  "lending interest": { skip: "interest", reason: INTEREST },
  "currency conversion": { skip: "conversion", reason: "Move between your own currency balances" },
  "stock split open": { skip: "split", reason: SPLIT },
  "stock split close": { skip: "split", reason: SPLIT },
  "stock distribution": {
    skip: "corporate_action",
    reason: "Stock distribution: not supported yet, add the shares by hand",
  },
  "card debit": { skip: "unsupported_type", reason: "Card payments are not tracked yet" },
  "spending cashback": { skip: "unsupported_type", reason: "Cashback is not tracked yet" },
};

const FEE_PARTS = [
  { amount: "stamp", cur: "stampCur" },
  { amount: "conversion", cur: "conversionCur" },
  { amount: "finra", cur: "finraCur" },
] as const;

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
    const word = normWord(at(c, cols.action));
    const entry = ACTIONS[word];
    if (!entry) {
      outcomes.push(unknownWordRow(rec, at(c, cols.action)));
      continue;
    }
    if ("skip" in entry) {
      outcomes.push(skipRow(rec, entry.skip, entry.reason));
      continue;
    }

    const when = readDate(at(c, cols.time), "YYYY-MM-DD", true);
    const stableId = at(c, cols.id) || undefined;

    if (entry.type === "DEPOSIT" || entry.type === "WITHDRAWAL") {
      const currency = at(c, cols.totalCur).toUpperCase();
      if (currencyProblem(currency)) {
        outcomes.push(currencySkipRow(rec, currency));
        continue;
      }
      if (!when.ok) {
        outcomes.push(cannotReadRow(rec, "Enter a valid trade date."));
        continue;
      }
      const total = readRequired(at(c, cols.total), "plain", "amount");
      if (!total.ok) {
        outcomes.push(cannotReadRow(rec, total.reason));
        continue;
      }
      const cash = cashAmount(entry.type, total.value);
      if (!cash.ok) {
        outcomes.push(cash.skip ? skipRow(rec, "unclear", cash.reason) : cannotReadRow(rec, cash.reason));
        continue;
      }
      outcomes.push(
        readyRow({
          rec,
          brokerName: NAME,
          type: entry.type,
          amount: cash.amount,
          currency,
          date: when.date,
          stableId,
          sortTime: when.time,
        }),
      );
      continue;
    }

    if (entry.type === "DIVIDEND") {
      const currency = at(c, cols.totalCur).toUpperCase();
      if (currencyProblem(currency)) {
        outcomes.push(currencySkipRow(rec, currency));
        continue;
      }
      const ticker = at(c, cols.ticker);
      if (!ticker) {
        outcomes.push(cannotReadRow(rec, "Type 'DIVIDEND' requires a Ticker."));
        continue;
      }
      if (!when.ok) {
        outcomes.push(cannotReadRow(rec, "Enter a valid trade date."));
        continue;
      }
      const total = readRequired(at(c, cols.total), "plain", "amount");
      if (!total.ok) {
        outcomes.push(cannotReadRow(rec, total.reason));
        continue;
      }
      if ((signOf(total.value) ?? 0) <= 0) {
        outcomes.push(skipRow(rec, "reversal", "Dividend reversal or zero dividend: not supported yet"));
        continue;
      }
      let gross = total.value;
      let fee = "0";
      let importNote: string | undefined;
      const whText = at(c, cols.withholding);
      if (whText !== "") {
        const wh = readNumber(whText, "plain");
        if (!wh.ok) {
          outcomes.push(cannotReadRow(rec, "Enter the fee as a number."));
          continue;
        }
        const whAbs = absDecimal(wh.value);
        if (signOf(whAbs) === 1) {
          const whCurrency = at(c, cols.withholdingCur).toUpperCase();
          if (whCurrency === currency) {
            gross = addDecimals(total.value, whAbs) ?? total.value;
            fee = whAbs;
          } else {
            importNote = `Tax of ${whAbs}${whCurrency ? ` ${whCurrency}` : ""} was not added back because it is not in the same currency as the dividend, so the amount shown is what you received. Add the tax by hand if you want it counted.`;
          }
        }
      }
      outcomes.push(
        readyRow({
          rec,
          brokerName: NAME,
          type: "DIVIDEND",
          ticker,
          market: translateExchange(at(c, cols.exchange)),
          amount: gross,
          currency,
          fee,
          date: when.date,
          importNote,
          stableId,
          sortTime: when.time,
        }),
      );
      continue;
    }

    // BUY / SELL.
    // Check 4: currency (the currency the share price is quoted in).
    const currency = at(c, cols.priceCur).toUpperCase();
    if (currencyProblem(currency)) {
      outcomes.push(currencySkipRow(rec, currency));
      continue;
    }
    // Check 5: values.
    const ticker = at(c, cols.ticker);
    if (!ticker) {
      outcomes.push(cannotReadRow(rec, `Type '${entry.type}' requires a Ticker.`));
      continue;
    }
    if (!when.ok) {
      outcomes.push(cannotReadRow(rec, "Enter a valid trade date."));
      continue;
    }
    const qty = readPositive(at(c, cols.shares), "plain", "quantity", { absolute: true });
    if (!qty.ok) {
      outcomes.push(cannotReadRow(rec, qty.reason));
      continue;
    }
    const price = readPositive(at(c, cols.price), "plain", "price");
    if (!price.ok) {
      outcomes.push(cannotReadRow(rec, price.reason));
      continue;
    }

    let fee = "0";
    const notes: string[] = [];
    let bad: string | null = null;
    for (const part of FEE_PARTS) {
      const text = at(c, cols[part.amount]);
      if (text === "") continue;
      const n = readNumber(text, "plain");
      if (!n.ok) {
        bad = "Enter the fee as a number.";
        break;
      }
      const amount = absDecimal(n.value);
      if (signOf(amount) !== 1) continue;
      const feeCurrency = at(c, cols[part.cur]).toUpperCase();
      if (feeCurrency === currency) {
        fee = addDecimals(fee, amount) ?? fee;
      } else if (feeCurrency === "") {
        notes.push(feeUnknownCurrencyNote(amount));
      } else {
        notes.push(feeMismatchNote(amount, feeCurrency));
      }
    }
    if (bad) {
      outcomes.push(cannotReadRow(rec, bad));
      continue;
    }

    outcomes.push(
      readyRow({
        rec,
        brokerName: NAME,
        type: entry.type,
        ticker,
        market: translateExchange(at(c, cols.exchange)),
        quantity: qty.value,
        price: price.value,
        currency,
        fee,
        date: when.date,
        importNote: notes.length ? notes.join(" ") : undefined,
        stableId,
        sortTime: when.time,
      }),
    );
  }

  return { outcomes, withholdings: [], ignoredLines, ignoredSections: [], accountCount: 0 };
}

export const trading212: PresetDefinition = {
  id: "trading212",
  name: NAME,
  beta: false,
  order: "detect-oldest",
  headerExample: "Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Total,Currency (Total),ID",
  check(table) {
    const loc = locateHeader(table, SPECS);
    return loc.ok ? { ok: true } : { ok: false, missing: loc.missing };
  },
  read(table) {
    return read(table);
  },
};

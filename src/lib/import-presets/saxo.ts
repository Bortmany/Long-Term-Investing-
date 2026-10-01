// Saxo "Trades" export, saved as CSV. [Beta]
//
// Real header (verified against real files):
//   Client ID,Trade Date,Value Date,Type,Instrument,Instrument ISIN,
//   Instrument currency,Exchange Description,Instrument Symbol,Event,Amount,
//   Order ID,Conversion Rate
// There are NO quantity, price or commission columns. A trade is described
// in the Event text: "Buy 3 @ 139.74 USD" / "Sell 4 @ 214.00 USD". The Amount
// column may use comma decimals ("-422,99") and is never used for buys and
// sells (the app works the amount out from quantity times price). Dates look
// like 30-Dec-2024. The symbol looks like "VWRA:xlon": the ticker before the
// colon, an exchange hint after it.
//
// Any file that does not have these columns is refused (Saxo has other
// export types with different headers). Fees, deposits and withdrawals are
// skipped. A corporate action is read as a dividend only when its text
// plainly says "dividend"; anything else is skipped.

import { translateExchange } from "./exchange-map";
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
  readNumber,
  readPositive,
  readyRow,
  shortWord,
  signOf,
  skipRow,
  unknownWordRow,
  type ColSpec,
} from "./shared";
import type { DraftRead, PresetDefinition, RowOutcome, SkipCode, Table } from "./types";

const NAME = "Saxo";

const SPECS: ColSpec[] = [
  { key: "date", names: ["Trade Date"], required: true },
  { key: "type", names: ["Type"], required: true },
  { key: "symbol", names: ["Instrument Symbol"], required: true },
  { key: "event", names: ["Event"], required: true },
  { key: "amount", names: ["Amount"], required: true },
  { key: "orderId", names: ["Order ID"] },
  { key: "instrumentCurrency", names: ["Instrument currency"] },
  { key: "exchangeDescription", names: ["Exchange Description"] },
];

const TRADE_EVENT = /^(buy|sell)\s+(-?[\d.,]+)\s*@\s*([\d.,]+)\s+([A-Za-z]{3})$/i;
const DIVIDEND_EVENT = /^(?:cash\s+)?dividend\b/i;
const PLAIN_TICKER = /^[A-Za-z0-9.\-]+$/;

const OTHER_TYPES: Record<string, { code: SkipCode; reason: string }> = {
  "cash amount": { code: "unsupported_type", reason: "Cash movements, fees and interest are not read from Saxo files yet" },
  deposit: { code: "unsupported_type", reason: "Deposits are not read from Saxo files yet" },
  withdrawal: { code: "unsupported_type", reason: "Withdrawals are not read from Saxo files yet" },
  fee: { code: "unsupported_type", reason: "Fees are not read from Saxo files yet" },
  interest: { code: "interest", reason: "Interest paid on cash is not tracked yet" },
};

const CORPORATE_ACTION =
  "Corporate action (for example a split or merger): not supported yet, add the resulting shares by hand";

function splitSymbol(symbol: string): { ticker: string; exchange: string } {
  const at1 = symbol.indexOf(":");
  if (at1 === -1) return { ticker: symbol.trim(), exchange: "" };
  return { ticker: symbol.slice(0, at1).trim(), exchange: symbol.slice(at1 + 1).trim() };
}

function read(table: Table): DraftRead {
  const outcomes: RowOutcome[] = [];
  let ignoredLines = 0;
  const loc = locateHeader(table, SPECS);
  if (!loc.ok) return { outcomes, withholdings: [], ignoredLines, ignoredSections: [], accountCount: 0 };
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

    // Check 2: the Type word.
    const typeText = at(c, cols.type);
    const typeWord = normWord(typeText);
    const eventText = at(c, cols.event);
    const isTrade = typeWord === "trade";
    const isCorporate = typeWord.includes("corporate action");
    if (!isTrade && !isCorporate) {
      const known = OTHER_TYPES[typeWord];
      outcomes.push(known ? skipRow(rec, known.code, known.reason) : unknownWordRow(rec, typeText));
      continue;
    }

    const { ticker, exchange } = splitSymbol(at(c, cols.symbol));
    // The exchange named in the symbol wins; the description is only used when
    // the symbol names none. An exchange we do not know gives no hint.
    const market = exchange !== "" ? translateExchange(exchange) : translateExchange(at(c, cols.exchangeDescription));
    const instrumentCurrency = at(c, cols.instrumentCurrency).toUpperCase();

    if (isCorporate) {
      // Only a plain dividend is read; everything else is skipped.
      if (!DIVIDEND_EVENT.test(eventText) || instrumentCurrency === "" || !PLAIN_TICKER.test(ticker)) {
        outcomes.push(skipRow(rec, "corporate_action", CORPORATE_ACTION));
        continue;
      }
      if (currencyProblem(instrumentCurrency)) {
        outcomes.push(currencySkipRow(rec, instrumentCurrency));
        continue;
      }
      const when = readDate(at(c, cols.date), "DD-MMM-YYYY");
      if (!when.ok) {
        outcomes.push(cannotReadRow(rec, "Enter a valid trade date."));
        continue;
      }
      const amount = readNumber(at(c, cols.amount), "eu");
      if (!amount.ok) {
        outcomes.push(cannotReadRow(rec, "Enter an amount as a number."));
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
          ticker,
          market,
          amount: amount.value,
          currency: instrumentCurrency,
          fee: "0",
          date: when.date,
          importNote:
            "Saxo shows this dividend as one amount. If tax was taken off, add it by hand if you want it counted.",
          stableId: at(c, cols.orderId) || undefined,
        }),
      );
      continue;
    }

    // A trade: read the Event text, e.g. "Buy 3 @ 139.74 USD".
    const ev = TRADE_EVENT.exec(eventText);
    if (!ev) {
      outcomes.push(
        skipRow(rec, "unclear", `We could not read this trade line ('${shortWord(eventText)}'), so we left it out`),
      );
      continue;
    }
    const side = ev[1].toLowerCase() === "buy" ? "BUY" : "SELL";

    // Check 3: asset kind (plain share or fund tickers only).
    if (!PLAIN_TICKER.test(ticker)) {
      outcomes.push(skipRow(rec, "asset_kind", "This does not look like a share or fund ticker, so we left it out"));
      continue;
    }

    // Check 4: currency (stated in the Event text).
    const currency = ev[4].toUpperCase();
    if (currencyProblem(currency)) {
      outcomes.push(currencySkipRow(rec, currency));
      continue;
    }
    if (instrumentCurrency !== "" && instrumentCurrency !== currency) {
      outcomes.push(
        skipRow(rec, "unclear", "The trade currency and the instrument currency differ, so we left it out instead of guessing"),
      );
      continue;
    }

    // Check 5: values.
    const when = readDate(at(c, cols.date), "DD-MMM-YYYY");
    if (!when.ok) {
      outcomes.push(cannotReadRow(rec, "Enter a valid trade date."));
      continue;
    }
    const qty = readPositive(ev[2], "us", "quantity", { absolute: true });
    if (!qty.ok) {
      outcomes.push(cannotReadRow(rec, qty.reason));
      continue;
    }
    const price = readPositive(ev[3], "us", "price");
    if (!price.ok) {
      outcomes.push(cannotReadRow(rec, price.reason));
      continue;
    }
    outcomes.push(
      readyRow({
        rec,
        brokerName: NAME,
        type: side,
        ticker,
        market,
        quantity: qty.value,
        price: price.value,
        currency,
        // The Saxo export has no commission column.
        fee: "0",
        date: when.date,
        stableId: at(c, cols.orderId) || undefined,
      }),
    );
  }

  return { outcomes, withholdings: [], ignoredLines, ignoredSections: [], accountCount: 0 };
}

export const saxo: PresetDefinition = {
  id: "saxo",
  name: NAME,
  beta: true,
  order: "detect-oldest",
  headerExample:
    "Client ID,Trade Date,Value Date,Type,Instrument,Instrument ISIN,Instrument currency,Exchange Description,Instrument Symbol,Event,Amount,Order ID,Conversion Rate",
  check(table) {
    const loc = locateHeader(table, SPECS);
    return loc.ok ? { ok: true } : { ok: false, missing: loc.missing };
  },
  read,
};

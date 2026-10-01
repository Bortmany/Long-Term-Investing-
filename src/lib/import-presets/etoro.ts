// eToro account statement, "Account Activity" sheet saved as CSV. [Beta]
//
// Columns are matched by name; "Units" and "Units / Contracts" both work. A
// lone "-" in a cell means empty. Numbers have thousands commas ("2,054.00").
// Dates are DD/MM/YYYY HH:MM:SS (day first, never guessed). The file lists
// newest first. There is no currency column: eToro accounts hold US dollars,
// so amounts are read as US dollars (the screen says so).
//
// eToro does not state a price. For Open Position / Position closed rows the
// price is worked out as Amount divided by Units and the row is marked so the
// screen can say "worked out from amount and units". A row with no Units is
// skipped. eToro shows dividends after tax with no separate tax row, so a
// dividend is imported as shown with fee 0.

import {
  absDecimal,
  at,
  cannotReadRow,
  cashAmount,
  currencyProblem,
  currencySkipRow,
  divideDecimals,
  isBlankRecord,
  isRepeatOfHeader,
  locateHeader,
  normWord,
  readDate,
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
  PresetDefinition,
  RowOutcome,
  SkipCode,
  Table,
} from "./types";

const NAME = "eToro";
const CURRENCY = "USD";

const SPECS: ColSpec[] = [
  { key: "date", names: ["Date"], required: true },
  { key: "type", names: ["Type"], required: true },
  { key: "details", names: ["Details"], required: true },
  { key: "amount", names: ["Amount"], required: true },
  { key: "units", names: ["Units", "Units / Contracts"], required: true },
  { key: "assetType", names: ["Asset type"], required: true },
  { key: "positionId", names: ["Position ID"] },
];

type Entry =
  | { kind: "BUY" | "SELL" | "DIVIDEND" | "DEPOSIT" | "WITHDRAWAL" }
  | { kind: "SKIP"; code: SkipCode; reason: string };

const ACTIONS: Record<string, Entry> = {
  "open position": { kind: "BUY" },
  "position closed": { kind: "SELL" },
  dividend: { kind: "DIVIDEND" },
  deposit: { kind: "DEPOSIT" },
  "withdraw request": { kind: "WITHDRAWAL" },
  interest: { kind: "SKIP", code: "interest", reason: "Interest paid on cash is not tracked yet" },
  "rollover fee": { kind: "SKIP", code: "unsupported_type", reason: "Overnight fees on open positions are not tracked yet" },
  fee: { kind: "SKIP", code: "unsupported_type", reason: "Account fees are not tracked yet" },
  "withdraw fee charged": { kind: "SKIP", code: "unsupported_type", reason: "Withdrawal fees are not tracked yet" },
  sdrt: { kind: "SKIP", code: "unsupported_type", reason: "Stamp duty is not tracked yet" },
  refund: { kind: "SKIP", code: "unsupported_type", reason: "Refunds are not tracked yet" },
  conversion: { kind: "SKIP", code: "conversion", reason: "Move between your own currency balances" },
};

const PLAIN_TICKER = /^[A-Za-z0-9.\-]+$/;

/** A lone dash means "nothing here". */
function cellOrEmpty(value: string): string {
  return value.trim() === "-" ? "" : value;
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
    const cell = (idx: number | undefined) => cellOrEmpty(at(c, idx));

    // Check 2: the type word.
    const typeText = cell(cols.type);
    const entry = ACTIONS[normWord(typeText)];
    if (!entry) {
      outcomes.push(unknownWordRow(rec, typeText));
      continue;
    }
    if (entry.kind === "SKIP") {
      outcomes.push(skipRow(rec, entry.code, entry.reason));
      continue;
    }

    // Check 4 (fixed currency) is the same for every row.
    if (currencyProblem(CURRENCY)) {
      outcomes.push(currencySkipRow(rec, CURRENCY));
      continue;
    }

    const when = readDate(cell(cols.date), "DD/MM/YYYY", true);

    if (entry.kind === "DEPOSIT" || entry.kind === "WITHDRAWAL") {
      if (!when.ok) {
        outcomes.push(cannotReadRow(rec, "Enter a valid trade date."));
        continue;
      }
      const amount = readRequired(cell(cols.amount), "us", "amount");
      if (!amount.ok) {
        outcomes.push(cannotReadRow(rec, amount.reason));
        continue;
      }
      // A deposit must be positive; a withdrawal request may be written either way.
      const cash = cashAmount(entry.kind, amount.value, entry.kind === "DEPOSIT");
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
          currency: CURRENCY,
          date: when.date,
          sortTime: when.time,
        }),
      );
      continue;
    }

    // Check 3: asset kind (shares and funds only).
    const assetType = cell(cols.assetType);
    const assetWord = normWord(assetType);
    if (assetWord !== "stocks" && assetWord !== "stock" && assetWord !== "etf") {
      outcomes.push(
        skipRow(
          rec,
          "asset_kind",
          assetWord === ""
            ? "The file does not say what kind of asset this is, so we left it out"
            : `${assetType}: InvestIQ tracks shares and funds only`,
        ),
      );
      continue;
    }
    const details = cell(cols.details);
    const ticker = details.split("/")[0].trim();
    if (!PLAIN_TICKER.test(ticker)) {
      outcomes.push(skipRow(rec, "unclear", "We could not read which stock this line is about, so we left it out"));
      continue;
    }

    if (!when.ok) {
      outcomes.push(cannotReadRow(rec, "Enter a valid trade date."));
      continue;
    }
    const amount = readRequired(cell(cols.amount), "us", "amount");
    if (!amount.ok) {
      outcomes.push(cannotReadRow(rec, amount.reason));
      continue;
    }

    if (entry.kind === "DIVIDEND") {
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
          amount: amount.value,
          currency: CURRENCY,
          fee: "0",
          date: when.date,
          sortTime: when.time,
        }),
      );
      continue;
    }

    // BUY (Open Position) / SELL (Position closed): price = amount / units.
    const unitsText = cell(cols.units);
    if (unitsText === "") {
      outcomes.push(skipRow(rec, "unclear", "This line has no units, so a price cannot be worked out. We left it out"));
      continue;
    }
    const units = readPositive(unitsText, "us", "quantity", { absolute: true });
    if (!units.ok) {
      outcomes.push(cannotReadRow(rec, units.reason));
      continue;
    }
    const total = readPositive(cell(cols.amount), "us", "amount", { absolute: true });
    if (!total.ok) {
      outcomes.push(cannotReadRow(rec, total.reason));
      continue;
    }
    const price = divideDecimals(absDecimal(total.value), units.value, 8);
    if (price === null || signOf(price) !== 1) {
      outcomes.push(cannotReadRow(rec, "Price per unit must be greater than zero."));
      continue;
    }
    outcomes.push(
      readyRow({
        rec,
        brokerName: NAME,
        type: entry.kind,
        ticker,
        quantity: units.value,
        price,
        currency: CURRENCY,
        fee: "0",
        date: when.date,
        sortTime: when.time,
        derivedPrice: true,
      }),
    );
  }

  return { outcomes, withholdings: [], ignoredLines, ignoredSections: [], accountCount: 0 };
}

export const etoro: PresetDefinition = {
  id: "etoro",
  name: NAME,
  beta: true,
  fixedCurrency: { code: CURRENCY, label: "US dollars" },
  order: "detect-newest",
  headerExample: "Date,Type,Details,Amount,Units,Realized Equity Change,Realized Equity,Balance,Position ID,Asset type,NWA",
  check(table) {
    const loc = locateHeader(table, SPECS);
    return loc.ok ? { ok: true } : { ok: false, missing: loc.missing };
  },
  read,
};

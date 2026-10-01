// Broker-file presets: each broker's rules on small inline files.
// Header detection, refusing a wrong file, every type word, date and number
// styles, sign handling, fee-currency mismatch, dividend and tax pairing,
// structural lines, delimiters and byte-order marks.

import { describe, expect, it } from "vitest";
import {
  readBrokerFile,
  type PresetId,
  type ReadOk,
  type ReadRefused,
  type RowOutcome,
} from "@/lib/import-presets";

function ok(preset: PresetId, text: string): ReadOk {
  const r = readBrokerFile(preset, text);
  if (!r.ok) throw new Error(`refused: ${r.message}`);
  return r;
}
function refused(preset: PresetId, text: string): ReadRefused {
  const r = readBrokerFile(preset, text);
  if (r.ok) throw new Error("expected a refusal");
  return r;
}
function only(result: ReadOk): RowOutcome {
  expect(result.outcomes).toHaveLength(1);
  return result.outcomes[0];
}

// ---------------------------------------------------------------------------
// Trading 212
// ---------------------------------------------------------------------------

const T212_HEAD =
  "Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Total,Currency (Total),ID";
function t212(rows: string[], head = T212_HEAD): string {
  return [head, ...rows].join("\n");
}
const T212_BUY = "Market buy,2026-01-12 15:31:07,US0378331005,AAPL,Apple,5,205.40,USD,1027.00,USD,T1";

describe("Trading 212", () => {
  it("accepts a file with only the required columns, in any order", () => {
    const head = "ID,Total,Currency (Total),Price / share,Currency (Price / share),No. of shares,Ticker,Time,Action";
    const r = ok("trading212", [head, "T1,1027.00,USD,205.40,USD,5,AAPL,2026-01-12 15:31:07,Market buy"].join("\n"));
    expect(r.ready[0].mapped).toMatchObject({ type: "BUY", ticker: "AAPL", quantity: "5", pricePerUnit: "205.40" });
  });

  it("accepts 'Time (UTC)' in place of 'Time'", () => {
    const r = ok("trading212", t212([T212_BUY], T212_HEAD.replace("Time", "Time (UTC)")));
    expect(r.ready).toHaveLength(1);
  });

  it("refuses a file missing required columns and names them", () => {
    const r = refused("trading212", "Action,Time,Ticker\nMarket buy,2026-01-12,AAPL");
    expect(r.reason).toBe("wrong_file");
    expect(r.missingColumns).toEqual([
      "No. of shares",
      "Price / share",
      "Currency (Price / share)",
      "Total",
      "Currency (Total)",
      "ID",
    ]);
    expect(r.message).toContain("Trading 212");
    expect(r.message).toContain("No. of shares");
  });

  it("refuses another broker's file and offers to switch", () => {
    const schwab = 'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount\n"01/05/2026","Buy","AAPL","A","1","$1","","-$1"';
    const r = refused("trading212", schwab);
    expect(r.suggestedPreset).toBe("schwab");
  });

  describe("every action word", () => {
    const cases: [string, string, "BUY" | "SELL" | "DIVIDEND" | "DEPOSIT" | "WITHDRAWAL" | "skip", string?][] = [
      ["Market buy", T212_BUY, "BUY"],
      ["Limit buy", T212_BUY.replace("Market buy", "Limit buy"), "BUY"],
      ["Stop buy", T212_BUY.replace("Market buy", "Stop buy"), "BUY"],
      ["Stop limit buy", T212_BUY.replace("Market buy", "Stop limit buy"), "BUY"],
      ["Market sell", T212_BUY.replace("Market buy", "Market sell"), "SELL"],
      ["Limit sell", T212_BUY.replace("Market buy", "limit SELL"), "SELL"],
      ["Stop sell", T212_BUY.replace("Market buy", "Stop sell"), "SELL"],
      ["Stop limit sell", T212_BUY.replace("Market buy", "Stop limit sell"), "SELL"],
      ["Dividend (Ordinary)", "Dividend (Ordinary),2026-03-14 00:00:00,,KO,Coke,10,0.51,USD,4.33,USD,T2", "DIVIDEND"],
      ["Dividend (Bonus)", "Dividend (Bonus),2026-03-14 00:00:00,,KO,Coke,10,0.51,USD,4.33,USD,T2", "DIVIDEND"],
      ["Dividend (Return of capital)", "Dividend (Return of capital),2026-03-14 00:00:00,,KO,Coke,10,0.51,USD,4.33,USD,T2", "DIVIDEND"],
      ["Dividend (Dividend manufactured payment)", "Dividend (Dividend manufactured payment),2026-03-14 00:00:00,,KO,Coke,10,0.51,USD,4.33,USD,T2", "DIVIDEND"],
      ["Deposit", "Deposit,2026-01-05 09:00:00,,,,,,,2000.00,USD,T3", "DEPOSIT"],
      ["Withdrawal", "Withdrawal,2026-01-05 09:00:00,,,,,,,-300.00,USD,T3", "WITHDRAWAL"],
      ["Interest on cash", "Interest on cash,2026-01-05 09:00:00,,,,,,,0.85,USD,T4", "skip", "interest"],
      ["Lending interest", "Lending interest,2026-01-05 09:00:00,,,,,,,0.85,USD,T4", "skip", "interest"],
      ["Currency conversion", "Currency conversion,2026-01-05 09:00:00,,,,,,,100.00,USD,T4", "skip", "conversion"],
      ["Stock split open", "Stock split open,2026-01-05 09:00:00,,NVDA,,90,,USD,0,USD,T4", "skip", "split"],
      ["Stock split close", "Stock split close,2026-01-05 09:00:00,,NVDA,,9,,USD,0,USD,T4", "skip", "split"],
      ["Stock distribution", "Stock distribution,2026-01-05 09:00:00,,XYZ,,1,,USD,0,USD,T4", "skip", "corporate_action"],
      ["Card debit", "Card debit,2026-01-05 09:00:00,,,,,,,5.00,USD,T4", "skip", "unsupported_type"],
      ["Spending cashback", "Spending cashback,2026-01-05 09:00:00,,,,,,,1.00,USD,T4", "skip", "unsupported_type"],
      ["an unknown word", "Banana,2026-01-05 09:00:00,,AAPL,,1,1,USD,1,USD,T4", "skip", "unknown_word"],
      ["an empty word", ",2026-01-05 09:00:00,,AAPL,,1,1,USD,1,USD,T4", "skip", "unknown_word"],
    ];
    for (const [name, line, expected, code] of cases) {
      it(name, () => {
        const r = ok("trading212", t212([line]));
        const o = only(r);
        if (expected === "skip") {
          expect(o.kind).toBe("skipped");
          if (o.kind === "skipped") expect(o.code).toBe(code);
        } else {
          expect(o.kind).toBe("ready");
          if (o.kind === "ready") expect(o.mapped.type).toBe(expected);
        }
      });
    }
  });

  it("an unknown action word is never a buy", () => {
    const r = ok("trading212", t212(["Market buyy,2026-01-12 15:31:07,,AAPL,Apple,5,205.40,USD,1027.00,USD,T1"]));
    expect(r.ready).toHaveLength(0);
    expect(r.skipped[0].reason).toBe("We do not recognise the word 'Market buyy' in this column");
  });

  it("reads plain times, fractional seconds and ISO times; refuses other date styles", () => {
    const base = (time: string) => t212([T212_BUY.replace("2026-01-12 15:31:07", time)]);
    expect(ok("trading212", base("2023-12-18 14:30:03.613")).ready[0].mapped.tradeDate).toBe("2023-12-18");
    expect(ok("trading212", base("2023-12-18T14:30:03Z")).ready[0].mapped.tradeDate).toBe("2023-12-18");
    expect(ok("trading212", base("2023-12-18T14:30:03.613+01:00")).ready[0].mapped.tradeDate).toBe("2023-12-18");
    const bad = ok("trading212", base("18/12/2023 14:30"));
    expect(bad.cannotRead).toHaveLength(1);
    expect(bad.cannotRead[0].reason).toBe("Enter a valid trade date.");
  });

  it("reads plain numbers only; thousands commas and text are 'cannot read'", () => {
    const line = (q: string, p: string) => t212([`Market buy,2026-01-12 15:31:07,,AAPL,Apple,${q},${p},USD,1.00,USD,T1`]);
    expect(ok("trading212", line('"1,000"', "1")).cannotRead[0].reason).toBe("Enter a quantity as a number.");
    expect(ok("trading212", line("5", "abc")).cannotRead[0].reason).toBe("Enter a price as a number.");
    expect(ok("trading212", line("0", "5")).cannotRead[0].reason).toBe("Quantity must be greater than zero.");
    expect(ok("trading212", line("", "5")).cannotRead[0].reason).toBe("Missing quantity.");
  });

  it("skips a currency the app does not hold and never converts", () => {
    const r = ok("trading212", t212(["Market buy,2026-03-20 08:05:00,,VOD,V,100,72.10,GBX,92.63,USD,T7"]));
    expect(r.skipped[0].code).toBe("currency");
    expect(r.skipped[0].reason).toBe("Currency GBX is not supported yet");
  });

  it("sign handling: a withdrawal is a positive amount; a wrong-signed cash row is skipped", () => {
    const w = ok("trading212", t212(["Withdrawal,2026-01-05 09:00:00,,,,,,,-300.00,USD,T3"]));
    expect(w.ready[0].mapped.amount).toBe("300.00");
    const badDeposit = ok("trading212", t212(["Deposit,2026-01-05 09:00:00,,,,,,,-5.00,USD,T3"]));
    expect(badDeposit.skipped[0].code).toBe("unclear");
    const zero = ok("trading212", t212(["Deposit,2026-01-05 09:00:00,,,,,,,0,USD,T3"]));
    expect(zero.cannotRead[0].reason).toBe("Amount must be greater than zero.");
  });

  describe("fees", () => {
    const head = T212_HEAD + ",Stamp duty reserve tax,Currency (Stamp duty reserve tax),Currency conversion fee,Currency (Currency conversion fee),Finra fee,Currency (Finra fee)";
    const buy = (fees: string) => t212([`${T212_BUY},${fees}`], head);

    it("adds the fees that are in the trade currency", () => {
      const r = ok("trading212", buy("0.50,USD,0.10,USD,0.02,USD"));
      expect(r.ready[0].mapped.fee).toBe("0.62");
      expect(r.ready[0].importNote).toBeUndefined();
    });

    it("a fee in another currency is left out with a note (fee 0)", () => {
      const r = ok("trading212", buy(",,0.30,EUR,,"));
      expect(r.ready[0].mapped.fee).toBe("0");
      expect(r.ready[0].importNote).toBe(
        "A fee of 0.30 EUR was not included because it is in a different currency. Add it by hand if you want it counted.",
      );
    });

    it("with one fee in the trade currency and one in another, only the first is counted", () => {
      const r = ok("trading212", buy("0.50,USD,0.30,EUR,,"));
      expect(r.ready[0].mapped.fee).toBe("0.50");
      expect(r.ready[0].importNote).toContain("0.30 EUR");
    });

    it("a fee with no stated currency is not guessed", () => {
      const r = ok("trading212", buy("0.50,,,,,"));
      expect(r.ready[0].mapped.fee).toBe("0");
      expect(r.ready[0].importNote).toContain("does not say which currency");
    });

    it("a fee that is not a number is 'cannot read'", () => {
      const r = ok("trading212", buy("abc,USD,,,,"));
      expect(r.cannotRead[0].reason).toBe("Enter the fee as a number.");
    });
  });

  describe("dividends state net and tax in one row", () => {
    const head = T212_HEAD + ",Withholding tax,Currency (Withholding tax)";
    it("gross = net + tax in the same currency; the tax is the fee", () => {
      const r = ok("trading212", t212(["Dividend (Ordinary),2026-03-14 00:00:00,,KO,Coke,10,0.51,USD,4.33,USD,T2,0.77,USD"], head));
      expect(r.ready[0].mapped).toMatchObject({ amount: "5.10", fee: "0.77", currency: "USD" });
    });
    it("tax in another currency is not added; the row carries a note", () => {
      const r = ok("trading212", t212(["Dividend (Ordinary),2026-03-14 00:00:00,,KO,Coke,10,0.51,USD,4.33,USD,T2,0.50,EUR"], head));
      expect(r.ready[0].mapped).toMatchObject({ amount: "4.33", fee: "0" });
      expect(r.ready[0].importNote).toContain("0.50 EUR");
    });
    it("no tax column value means fee 0", () => {
      const r = ok("trading212", t212(["Dividend (Ordinary),2026-03-14 00:00:00,,KO,Coke,10,0.51,USD,4.33,USD,T2,,"], head));
      expect(r.ready[0].mapped).toMatchObject({ amount: "4.33", fee: "0" });
    });
    it("a negative dividend is skipped as a reversal", () => {
      const r = ok("trading212", t212(["Dividend (Ordinary),2026-03-14 00:00:00,,KO,Coke,10,0.51,USD,-4.33,USD,T2,,"], head));
      expect(r.skipped[0].code).toBe("reversal");
    });
  });

  it("uses the row ID as the reference, else a fingerprint", () => {
    const r = ok("trading212", t212([T212_BUY, T212_BUY.replace(",T1", ",")]));
    expect(r.ready.map((x) => x.reference)[0]).toBe("trading212:T1");
    expect(r.ready.map((x) => x.reference)[1]).toMatch(/^trading212:h:/);
  });

  it("notes are only 'Imported from Trading 212'", () => {
    expect(ok("trading212", t212([T212_BUY])).ready[0].mapped.note).toBe("Imported from Trading 212");
  });
});

// ---------------------------------------------------------------------------
// Interactive Brokers
// ---------------------------------------------------------------------------

const FLEX_HEAD = '"ClientAccountID","CurrencyPrimary","AssetClass","Symbol","ISIN","TradeDate","Buy/Sell","Quantity","TradePrice","IBCommission","IBCommissionCurrency","TransactionID"';
const FLEX_BUY = '"U0","USD","STK","AAPL","US0378331005","20260112","BUY","10","205.40","-1.00","USD","900000001"';

describe("Interactive Brokers: Flex layout", () => {
  it("matches columns by name, so a different order works", () => {
    const head = "TransactionID,Symbol,Quantity,TradePrice,Buy/Sell,TradeDate,AssetClass,CurrencyPrimary";
    const r = ok("ibkr", [head, "900000009,KO,3,60.00,SELL,20260302,STK,USD"].join("\n"));
    expect(r.layout).toBe("flex");
    expect(r.ready[0].mapped).toMatchObject({ type: "SELL", ticker: "KO", quantity: "3", tradeDate: "2026-03-02", fee: "0" });
    expect(r.ready[0].reference).toBe("ibkr:900000009");
  });

  it("refuses a file missing columns and names them", () => {
    const r = refused("ibkr", "Symbol,Quantity\nAAPL,1");
    expect(r.missingColumns).toEqual(expect.arrayContaining(["TradeDate", "Buy/Sell", "TradePrice"]));
  });

  it("Buy/Sell words: BUY and SELL in any case, anything else skipped", () => {
    const r = ok("ibkr", [FLEX_HEAD, FLEX_BUY, FLEX_BUY.replace('"BUY"', '"sell"'), FLEX_BUY.replace('"BUY"', '"SHORT"')].join("\n"));
    expect(r.ready.map((x) => x.mapped.type)).toEqual(["BUY", "SELL"]);
    expect(r.skipped[0].code).toBe("unknown_word");
  });

  it("asset classes: options are skipped as options, other kinds as not-shares", () => {
    const r = ok("ibkr", [FLEX_HEAD, FLEX_BUY.replace('"STK"', '"OPT"'), FLEX_BUY.replace('"STK"', '"FUT"'), FLEX_BUY.replace('"STK"', '""')].join("\n"));
    expect(r.skipped.map((s) => s.code)).toEqual(["option", "asset_kind", "asset_kind"]);
  });

  it("dates: YYYYMMDD and YYYY-MM-DD are read; day-first is refused", () => {
    expect(ok("ibkr", [FLEX_HEAD, FLEX_BUY.replace("20260112", "2026-01-12")].join("\n")).ready).toHaveLength(1);
    const bad = ok("ibkr", [FLEX_HEAD, FLEX_BUY.replace("20260112", "12/01/2026")].join("\n"));
    expect(bad.cannotRead[0].reason).toBe("Enter a valid trade date.");
  });

  it("quantity is unsigned; a zero quantity cannot be read", () => {
    const bad = ok("ibkr", [FLEX_HEAD, FLEX_BUY.replace('"10"', '"0"')].join("\n"));
    expect(bad.cannotRead[0].reason).toBe("Quantity must be greater than zero.");
  });

  it("commission: absolute value; in another currency it is left out with a note", () => {
    const same = ok("ibkr", [FLEX_HEAD, FLEX_BUY].join("\n"));
    expect(same.ready[0].mapped.fee).toBe("1.00");
    const other = ok("ibkr", [FLEX_HEAD, FLEX_BUY.replace('"-1.00","USD"', '"-1.00","EUR"')].join("\n"));
    expect(other.ready[0].mapped.fee).toBe("0");
    expect(other.ready[0].importNote).toContain("1.00 EUR");
  });

  it("a repeated header line is structural", () => {
    const r = ok("ibkr", [FLEX_HEAD, FLEX_BUY, FLEX_HEAD].join("\n"));
    expect(r.ignoredLines).toBe(1);
    expect(r.ready).toHaveLength(1);
  });
});

const ACT_TRADES_HEAD = "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code";
const ACT_TRADE = (qty: string, extra = "Stocks") =>
  `Trades,Data,Order,${extra},USD,AAPL,"2026-01-12, 09:45:31",${qty},205.40,210.00,-2054.00,-1.00,2055.00,0,46.00,O`;
const ACT_DIV_HEAD = "Dividends,Header,Currency,Date,Description,Amount";
const ACT_TAX_HEAD = "Withholding Tax,Header,Currency,Date,Description,Amount,Code";

describe("Interactive Brokers: Activity Statement layout [Beta]", () => {
  it("reads only the Trades rows with DataDiscriminator 'Order'; closed lots are structural", () => {
    const r = ok(
      "ibkr",
      [
        "Statement,Header,Field Name,Field Value",
        ACT_TRADES_HEAD,
        ACT_TRADE("10"),
        ACT_TRADE("-4"),
        ACT_TRADE("5").replace(",Order,", ",ClosedLot,"),
        ACT_TRADE("5").replace(",Order,", ",Weird,"),
        "Trades,SubTotal,,Stocks,USD,,,6,,,-1198.50,-2.00,,33.00,51.50,",
        "Trades,Total,,,,,,,,,-1198.50,-2.00,,33.00,51.50,",
      ].join("\n"),
    );
    expect(r.layout).toBe("activity");
    expect(r.ready.map((x) => `${x.mapped.type}:${x.mapped.quantity}`)).toEqual(["BUY:10", "SELL:4"]);
    expect(r.skipped[0].code).toBe("unknown_word");
    // closed lot, subtotal, total, and the Statement section line
    expect(r.ignoredLines).toBe(4);
    expect(r.ignoredSections).toEqual(["Statement"]);
  });

  it("reads quantities with thousands commas", () => {
    const r = ok("ibkr", [ACT_TRADES_HEAD, ACT_TRADE('"1,000"')].join("\n"));
    expect(r.ready[0].mapped.quantity).toBe("1000");
  });

  it("skips options and other asset categories", () => {
    const r = ok("ibkr", [ACT_TRADES_HEAD, ACT_TRADE("1", "Equity and Index Options"), ACT_TRADE("1", "Futures")].join("\n"));
    expect(r.skipped.map((s) => s.code)).toEqual(["option", "asset_kind"]);
  });

  it("deposits and withdrawals: direction from the sign, totals ignored", () => {
    const r = ok(
      "ibkr",
      [
        "Deposits & Withdrawals,Header,Currency,Settle Date,Description,Amount",
        "Deposits & Withdrawals,Data,USD,2026-01-05,Electronic Fund Transfer,5000",
        "Deposits & Withdrawals,Data,USD,2026-04-10,Electronic Fund Transfer,-500",
        "Deposits & Withdrawals,Data,Total,,,4500",
      ].join("\n"),
    );
    expect(r.ready.map((x) => `${x.mapped.type}:${x.mapped.amount}`)).toEqual(["DEPOSIT:5000", "WITHDRAWAL:500"]);
    expect(r.ignoredLines).toBe(1);
  });

  it("an unpaired tax line becomes a FEE entry tied to the ticker with the note 'Tax withheld'", () => {
    const r = ok("ibkr", [ACT_TAX_HEAD, "Withholding Tax,Data,USD,2026-02-12,AAPL(US0378331005) Cash Dividend USD 0.24 per Share - US Tax,-0.36,"].join("\n"));
    expect(r.ready).toHaveLength(1);
    expect(r.ready[0].mapped).toMatchObject({ type: "FEE", ticker: "AAPL", amount: "0.36", note: "Tax withheld" });
    expect(r.absorbedLines).toBe(0);
  });

  it("two dividends with the same ticker and day are not paired (the tax stays its own entry)", () => {
    const r = ok(
      "ibkr",
      [
        ACT_DIV_HEAD,
        "Dividends,Data,USD,2026-02-12,AAPL(US0378331005) Cash Dividend USD 0.24 per Share (Ordinary Dividend),2.40",
        "Dividends,Data,USD,2026-02-12,AAPL(US0378331005) Cash Dividend USD 0.10 per Share (Special Dividend),1.00",
        ACT_TAX_HEAD,
        "Withholding Tax,Data,USD,2026-02-12,AAPL(US0378331005) Cash Dividend USD 0.24 per Share - US Tax,-0.36,",
      ].join("\n"),
    );
    expect(r.ready.filter((x) => x.mapped.type === "DIVIDEND").map((x) => x.mapped.fee)).toEqual(["0", "0"]);
    expect(r.ready.filter((x) => x.mapped.type === "FEE")).toHaveLength(1);
  });

  it("a tax on a different day or currency is not paired", () => {
    const r = ok(
      "ibkr",
      [
        ACT_DIV_HEAD,
        "Dividends,Data,USD,2026-02-12,AAPL(US0378331005) Cash Dividend USD 0.24 per Share (Ordinary Dividend),2.40",
        ACT_TAX_HEAD,
        "Withholding Tax,Data,USD,2026-02-13,AAPL(US0378331005) Cash Dividend USD 0.24 per Share - US Tax,-0.36,",
      ].join("\n"),
    );
    expect(r.ready.find((x) => x.mapped.type === "DIVIDEND")!.mapped.fee).toBe("0");
    expect(r.ready.filter((x) => x.mapped.type === "FEE")).toHaveLength(1);
  });

  it("a tax refund, a fee refund, interest and a split are skipped with reasons", () => {
    const r = ok(
      "ibkr",
      [
        ACT_TAX_HEAD,
        "Withholding Tax,Data,USD,2026-02-12,AAPL(US0378331005) Cash Dividend USD 0.24 per Share - US Tax,0.36,",
        "Fees,Header,Subtitle,Currency,Date,Description,Amount",
        "Fees,Data,Other Fees,USD,2026-03-31,Refund,4.50",
        "Interest,Header,Currency,Date,Description,Amount",
        "Interest,Data,USD,2026-03-04,USD Credit Interest for Feb-2026,1.12",
        "Interest,Data,Total,,,1.12",
        "Corporate Actions,Header,Asset Category,Currency,Report Date,Date/Time,Description,Quantity,Proceeds,Value,Realized P/L,Code",
        'Corporate Actions,Data,Stocks,USD,2026-05-20,"2026-05-20, 20:25:00",NVDA(US67066G1040) Split 10 for 1 (NVDA),90,0,0,0,',
        'Corporate Actions,Data,Stocks,USD,2026-05-21,"2026-05-21, 20:25:00",XYZ(US0000000000) Merger,90,0,0,0,',
      ].join("\n"),
    );
    expect(r.ready).toHaveLength(0);
    expect(r.skipped.map((s) => s.code)).toEqual(["tax_refund", "fee_refund", "interest", "split", "corporate_action"]);
  });

  it("a dividend that is not plainly a cash dividend is skipped", () => {
    const r = ok("ibkr", [ACT_DIV_HEAD, "Dividends,Data,USD,2026-02-12,AAPL(US0378331005) Payment in Lieu of Dividend (Ordinary Dividend),2.40"].join("\n"));
    expect(r.skipped[0].code).toBe("unsupported_type");
  });

  it("refuses an Activity Statement whose Trades section lacks a needed column", () => {
    const r = refused("ibkr", ["Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity", ACT_TRADE("1")].join("\n"));
    expect(r.missingColumns).toEqual(["T. Price (in the Trades section)"]);
  });

  it("refuses a file with neither layout", () => {
    expect(refused("ibkr", "a,b\n1,2").reason).toBe("wrong_file");
  });
});

// ---------------------------------------------------------------------------
// Saxo
// ---------------------------------------------------------------------------

const SAXO_HEAD = "Client ID,Trade Date,Value Date,Type,Instrument,Instrument ISIN,Instrument currency,Exchange Description,Instrument Symbol,Event,Amount,Order ID,Conversion Rate";
const saxoRow = (over: Partial<Record<string, string>> = {}): string => {
  const v = { client: "1", date: "30-Dec-2024", vdate: "02-Jan-2025", type: "Trade", inst: "Vanguard", isin: "IE00", icur: "USD", exch: "NYSE", sym: "VTI:xnys", event: "Buy 3 @ 139.74 USD", amount: '"-422,99"', order: "5001", rate: "1", ...over };
  return [v.client, v.date, v.vdate, v.type, v.inst, v.isin, v.icur, v.exch, v.sym, v.event, v.amount, v.order, v.rate].join(",");
};

describe("Saxo [Beta]", () => {
  it("parses the Event text and uses the Order ID as the reference", () => {
    const r = ok("saxo", [SAXO_HEAD, saxoRow()].join("\n"));
    expect(r.ready[0].mapped).toMatchObject({
      type: "BUY",
      ticker: "VTI",
      market: "US",
      quantity: "3",
      pricePerUnit: "139.74",
      currency: "USD",
      tradeDate: "2024-12-30",
      fee: "0",
    });
    expect(r.ready[0].reference).toBe("saxo:5001");
  });

  it("sells, negative quantities, fractional quantities and a thousands quantity", () => {
    const r = ok(
      "saxo",
      [
        SAXO_HEAD,
        saxoRow({ event: "Sell 4 @ 214.00 USD", order: "1" }),
        saxoRow({ event: "Sell -4 @ 214.00 USD", order: "2" }),
        saxoRow({ event: "Buy 0.5 @ 10.25 USD", order: "3" }),
        saxoRow({ event: '"Buy 1,000 @ 1.50 USD"', order: "4" }),
      ].join("\n"),
    );
    expect(r.ready.map((x) => `${x.mapped.type}:${x.mapped.quantity}`)).toEqual(["SELL:4", "SELL:4", "BUY:0.5", "BUY:1000"]);
  });

  it("refuses any other header (the old assumed layout and other Saxo exports)", () => {
    const old = "Transaction ID,Booking Date,Type,Instrument,Symbol,Exchange,Quantity,Price,Currency,Commission,Amount\nS1,05-01-2026,Buy,A,AAPL:xnas,XNAS,1,1,USD,0,1";
    const r = refused("saxo", old);
    expect(r.missingColumns).toEqual(expect.arrayContaining(["Trade Date", "Instrument Symbol", "Event"]));
    const summary = "Client ID,Account,Balance\n1,2,3";
    expect(refused("saxo", summary).reason).toBe("wrong_file");
  });

  it("date style is DD-MMM-YYYY only", () => {
    const r = ok("saxo", [SAXO_HEAD, saxoRow({ date: "2024-12-30" }), saxoRow({ date: "30/12/2024", order: "9" })].join("\n"));
    expect(r.cannotRead).toHaveLength(2);
    expect(r.cannotRead[0].reason).toBe("Enter a valid trade date.");
  });

  it("other Type words: deposits, fees and unknown words are skipped, never trades", () => {
    const r = ok(
      "saxo",
      [
        SAXO_HEAD,
        saxoRow({ type: "Cash Amount", event: "Deposit 5000 USD" }),
        saxoRow({ type: "Fee", event: "Buy 3 @ 1 USD" }),
        saxoRow({ type: "Banana", event: "Buy 3 @ 1 USD" }),
      ].join("\n"),
    );
    expect(r.ready).toHaveLength(0);
    expect(r.skipped.map((s) => s.code)).toEqual(["unsupported_type", "unsupported_type", "unknown_word"]);
  });

  it("an Event it cannot read is skipped, not guessed", () => {
    const r = ok("saxo", [SAXO_HEAD, saxoRow({ event: "Buy to open 3 contracts" })].join("\n"));
    expect(r.skipped[0].code).toBe("unclear");
  });

  it("skips another currency, an odd symbol, and a currency disagreement", () => {
    const r = ok(
      "saxo",
      [
        SAXO_HEAD,
        saxoRow({ event: "Buy 3 @ 150.00 EUR", icur: "EUR", order: "1" }),
        saxoRow({ sym: "EURUSD:fx", order: "2" }).replace("EURUSD:fx", "EUR/USD:fx"),
        saxoRow({ icur: "EUR", order: "3" }),
      ].join("\n"),
    );
    expect(r.skipped.map((s) => s.code)).toEqual(["currency", "asset_kind", "unclear"]);
  });

  it("corporate actions: only a plainly worded dividend is read", () => {
    const r = ok(
      "saxo",
      [
        SAXO_HEAD,
        saxoRow({ type: "Corporate Action", event: "Cash Dividend 0.51 USD per share", amount: '"5,10"', order: "1" }),
        saxoRow({ type: "Corporate Action", event: "Stock split 10 for 1", amount: '"0,00"', order: "2" }),
        saxoRow({ type: "Corporate Action", event: "Dividend", amount: '"1,00"', icur: "", order: "3" }),
      ].join("\n"),
    );
    expect(r.ready).toHaveLength(1);
    expect(r.ready[0].mapped).toMatchObject({ type: "DIVIDEND", amount: "5.10", fee: "0" });
    expect(r.ready[0].importNote).toContain("one amount");
    expect(r.skipped.map((s) => s.code)).toEqual(["corporate_action", "corporate_action"]);
  });

  it("comma-decimal amounts are read; a malformed dividend amount cannot be read", () => {
    const r = ok("saxo", [SAXO_HEAD, saxoRow({ type: "Corporate Action", event: "Cash Dividend", amount: "5.10.2", order: "1" })].join("\n"));
    expect(r.cannotRead[0].reason).toBe("Enter an amount as a number.");
  });

  it("an unknown exchange gives no market hint; two fills of one order keep both rows", () => {
    const r = ok("saxo", [SAXO_HEAD, saxoRow({ sym: "VWRA:xlon" }), saxoRow({ sym: "VWRA:xlon" })].join("\n"));
    expect(r.ready[0].mapped.market).toBeUndefined();
    expect(r.ready.map((x) => x.reference)).toEqual(["saxo:5001", "saxo:5001#2"]);
  });

  it("reads a semicolon file with comma decimals", () => {
    const text = [SAXO_HEAD, saxoRow({ amount: "-422,99" })].join("\n").replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g, ";");
    const r = ok("saxo", text);
    expect(r.ready[0].mapped.quantity).toBe("3");
  });
});

// ---------------------------------------------------------------------------
// eToro
// ---------------------------------------------------------------------------

const ETORO_HEAD = "Date,Type,Details,Amount,Units,Realized Equity Change,Realized Equity,Balance,Position ID,Asset type,NWA";
const etoro = (type: string, details: string, amount: string, units: string, asset: string, date = "12/01/2026 15:31:00") =>
  `${date},${type},${details},${amount},${units},0,0,0,P1,${asset},-`;

describe("eToro [Beta]", () => {
  it("accepts 'Units' and 'Units / Contracts'", () => {
    const a = ok("etoro", [ETORO_HEAD, etoro("Open Position", "AAPL/USD", "2054.00", "10", "Stocks")].join("\n"));
    const b = ok("etoro", [ETORO_HEAD.replace("Units", "Units / Contracts"), etoro("Open Position", "AAPL/USD", "2054.00", "10", "Stocks")].join("\n"));
    expect(a.ready).toHaveLength(1);
    expect(b.ready).toHaveLength(1);
  });

  it("refuses a file without the expected columns", () => {
    const r = refused("etoro", "Date,Type\n1,2");
    expect(r.missingColumns).toEqual(["Details", "Amount", "Units", "Asset type"]);
  });

  it("type words", () => {
    const rows = [
      etoro("Open Position", "AAPL/USD", "2054.00", "10", "Stocks"),
      etoro("Position closed", "AAPL/USD", "856.00", "4", "ETF"),
      etoro("Dividend", "KO/USD", "4.33", "-", "Stocks"),
      etoro("Deposit", "-", "500.00", "-", "-"),
      etoro("Withdraw Request", "-", "-200.00", "-", "-"),
      etoro("Withdraw Request", "-", "200.00", "-", "-"),
      etoro("Interest", "-", "1.00", "-", "-"),
      etoro("Rollover Fee", "AAPL/USD", "1.00", "-", "Stocks"),
      etoro("Fee", "-", "1.00", "-", "-"),
      etoro("SDRT", "AAPL/USD", "1.00", "-", "Stocks"),
      etoro("Refund", "-", "1.00", "-", "-"),
      etoro("Conversion", "-", "1.00", "-", "-"),
      etoro("Withdraw Fee Charged", "-", "1.00", "-", "-"),
      etoro("Edit Stop Loss", "AAPL/USD", "0", "-", "Stocks"),
    ];
    const r = ok("etoro", [ETORO_HEAD, ...rows].join("\n"));
    expect(r.ready.map((x) => x.mapped.type).sort()).toEqual(["BUY", "DEPOSIT", "DIVIDEND", "SELL", "WITHDRAWAL", "WITHDRAWAL"]);
    expect(r.skipped.map((s) => s.code)).toEqual([
      "interest",
      "unsupported_type",
      "unsupported_type",
      "unsupported_type",
      "unsupported_type",
      "conversion",
      "unsupported_type",
      "unknown_word",
    ]);
  });

  it("'-' means empty: a trade with no units is skipped", () => {
    const r = ok("etoro", [ETORO_HEAD, etoro("Open Position", "AAPL/USD", "2054.00", "-", "Stocks")].join("\n"));
    expect(r.skipped[0].reason).toContain("no units");
  });

  it("thousands commas are read in amounts and units; the price is amount / units", () => {
    const r = ok("etoro", [ETORO_HEAD, etoro("Open Position", "AAPL/USD", '"12,054.00"', '"1,000"', "Stocks")].join("\n"));
    expect(r.ready[0].mapped.quantity).toBe("1000");
    expect(r.ready[0].mapped.pricePerUnit).toBe("12.054");
  });

  it("non-share assets are skipped", () => {
    const r = ok(
      "etoro",
      [
        ETORO_HEAD,
        etoro("Open Position", "BTC/USD", "300.00", "0.005", "Crypto"),
        etoro("Open Position", "EURUSD/USD", "300.00", "100", "Currencies"),
        etoro("Open Position", "AAPL/USD", "300.00", "1", "CFD"),
        etoro("Open Position", "AAPL/USD", "300.00", "1", "-"),
      ].join("\n"),
    );
    expect(r.ready).toHaveLength(0);
    expect(r.skipped.map((s) => s.code)).toEqual(["asset_kind", "asset_kind", "asset_kind", "asset_kind"]);
  });

  it("dates are day-first: 13/02/2026 is fine, 02/13/2026 is refused", () => {
    const good = ok("etoro", [ETORO_HEAD, etoro("Deposit", "-", "5.00", "-", "-", "13/02/2026 10:00:00")].join("\n"));
    expect(good.ready[0].mapped.tradeDate).toBe("2026-02-13");
    const bad = ok("etoro", [ETORO_HEAD, etoro("Deposit", "-", "5.00", "-", "-", "02/13/2026 10:00:00")].join("\n"));
    expect(bad.cannotRead[0].reason).toBe("Enter a valid trade date.");
  });

  it("a deposit written negative is skipped, never flipped", () => {
    const r = ok("etoro", [ETORO_HEAD, etoro("Deposit", "-", "-5.00", "-", "-")].join("\n"));
    expect(r.skipped[0].code).toBe("unclear");
  });

  it("amounts are read as US dollars and say so", () => {
    const r = ok("etoro", [ETORO_HEAD, etoro("Deposit", "-", "5.00", "-", "-")].join("\n"));
    expect(r.currencyAssumed).toEqual({ code: "USD", label: "US dollars" });
    expect(r.ready[0].mapped.currency).toBe("USD");
  });
});

// ---------------------------------------------------------------------------
// Charles Schwab
// ---------------------------------------------------------------------------

const SCHWAB_HEAD = '"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"';
const sw = (date: string, action: string, symbol: string, qty: string, price: string, fees: string, amount: string) =>
  `"${date}","${action}","${symbol}","DESC","${qty}","${price}","${fees}","${amount}"`;

describe("Charles Schwab", () => {
  it("skips the title line and the totals line, counting them", () => {
    const r = ok("schwab", ['"Transactions  for account XXXX-1234 as of 06/30/2026 12:00:00 ET"', SCHWAB_HEAD, sw("01/12/2026", "Buy", "AAPL", "10", "$205.40", "", "-$2,054.00"), '"Transactions Total","","","","","","","$1,234.56"'].join("\n"));
    expect(r.ready).toHaveLength(1);
    expect(r.ignoredLines).toBe(2);
    expect(r.ready[0].line).toBe(3);
  });

  it("refuses a file without the expected columns", () => {
    const r = refused("schwab", "Date,Action\n1,2");
    expect(r.missingColumns).toEqual(["Symbol", "Quantity", "Price", "Amount"]);
  });

  describe("every action word", () => {
    const buyLike = (action: string) => ok("schwab", [SCHWAB_HEAD, sw("01/12/2026", action, "AAPL", "1", "$1.00", "", "-$1.00")].join("\n"));
    for (const [word, type] of [["Buy", "BUY"], ["Sell", "SELL"]] as const) {
      it(word, () => expect(buyLike(word).ready[0].mapped.type).toBe(type));
    }
    const dividends = ["Qualified Dividend", "Cash Dividend", "Non-Qualified Div", "Non-Qual Div"];
    for (const word of dividends) {
      it(word, () => {
        const r = ok("schwab", [SCHWAB_HEAD, sw("01/12/2026", word, "KO", "", "", "", "$5.10")].join("\n"));
        expect(r.ready[0].mapped).toMatchObject({ type: "DIVIDEND", amount: "5.10", fee: "0" });
      });
    }
    for (const word of ["Foreign Tax Paid", "NRA Tax Adj", "Foreign Tax"]) {
      it(`${word} (a tax line)`, () => {
        const r = ok("schwab", [SCHWAB_HEAD, sw("01/12/2026", word, "KO", "", "", "", "-$0.77")].join("\n"));
        expect(r.ready[0].mapped).toMatchObject({ type: "FEE", amount: "0.77", note: "Tax withheld" });
      });
    }
    for (const word of ["MoneyLink Transfer", "Wire Funds Received", "Wire Funds"]) {
      it(`${word} (cash, direction from the sign)`, () => {
        const inn = ok("schwab", [SCHWAB_HEAD, sw("01/12/2026", word, "", "", "", "", "$5,000.00")].join("\n"));
        expect(inn.ready[0].mapped).toMatchObject({ type: "DEPOSIT", amount: "5000.00" });
        const out = ok("schwab", [SCHWAB_HEAD, sw("01/12/2026", word, "", "", "", "", "-$500.00")].join("\n"));
        expect(out.ready[0].mapped).toMatchObject({ type: "WITHDRAWAL", amount: "500.00" });
      });
    }
    const skipped: [string, string][] = [
      ["Journal", "transfer"],
      ["Bank Interest", "interest"],
      ["Stock Split", "split"],
      ["Reinvest Shares", "reinvestment"],
      ["Reinvest Dividend", "reinvestment"],
      ["Cash In Lieu", "corporate_action"],
      ["Service Fee", "unsupported_type"],
      ["Buy to Open", "option"],
      ["Sell to Open", "option"],
      ["Sell to Close", "option"],
      ["Buy to Close", "option"],
      ["Expired", "option"],
      ["Assigned", "option"],
      ["Something New", "unknown_word"],
    ];
    for (const [word, code] of skipped) {
      it(`${word} is skipped (${code})`, () => {
        const r = ok("schwab", [SCHWAB_HEAD, sw("01/12/2026", word, "AAPL", "1", "$1.00", "", "-$1.00")].join("\n"));
        expect(r.ready).toHaveLength(0);
        expect(r.skipped[0].code).toBe(code);
      });
    }
  });

  it("dates are month-first, and an 'as of' date uses the FIRST date", () => {
    const r = ok("schwab", [SCHWAB_HEAD, sw("03/15/2026 as of 03/14/2026", "Buy", "KO", "1", "$60.00", "", "-$60.00")].join("\n"));
    expect(r.ready[0].mapped.tradeDate).toBe("2026-03-15");
    const bad = ok("schwab", [SCHWAB_HEAD, sw("25/03/2026", "Buy", "KO", "1", "$60.00", "", "-$60.00")].join("\n"));
    expect(bad.cannotRead[0].reason).toBe("Enter a valid trade date.");
  });

  it("numbers: $ and thousands commas, fees, bad values", () => {
    const r = ok("schwab", [SCHWAB_HEAD, sw("01/12/2026", "Sell", "AAPL", "1,000", "$1,205.40", "$0.65", "$1.00")].join("\n"));
    expect(r.ready[0].mapped).toMatchObject({ quantity: "1000", pricePerUnit: "1205.40", fee: "0.65", currency: "USD" });
    const bad = ok("schwab", [SCHWAB_HEAD, sw("01/12/2026", "Sell", "AAPL", "1", "12,3", "", "$1.00")].join("\n"));
    expect(bad.cannotRead[0].reason).toBe("Enter a price as a number.");
    const nofee = ok("schwab", [SCHWAB_HEAD, sw("01/12/2026", "Sell", "AAPL", "1", "$2.00", "abc", "$1.00")].join("\n"));
    expect(nofee.cannotRead[0].reason).toBe("Enter the fee as a number.");
  });

  it("option symbols and odd symbols are skipped before anything is read", () => {
    const r = ok("schwab", [SCHWAB_HEAD, sw("01/12/2026", "Buy", "AAPL 06/19/2026 220.00 C", "1", "$3.20", "", "-$3.20"), sw("01/12/2026", "Buy", "ABC/D", "1", "$3.20", "", "-$3.20")].join("\n"));
    expect(r.skipped.map((s) => s.code)).toEqual(["option", "asset_kind"]);
  });

  it("the tax line joins the dividend with the same ticker and first date", () => {
    const r = ok("schwab", [SCHWAB_HEAD, sw("03/15/2026 as of 03/14/2026", "NRA Tax Adj", "KO", "", "", "", "-$0.77"), sw("03/15/2026 as of 03/14/2026", "Qualified Dividend", "KO", "", "", "", "$5.10")].join("\n"));
    expect(r.ready).toHaveLength(1);
    expect(r.ready[0].mapped).toMatchObject({ type: "DIVIDEND", amount: "5.10", fee: "0.77" });
    expect(r.absorbedLines).toBe(1);
  });

  it("a tax with no dividend, or on another ticker, becomes a separate FEE entry", () => {
    const r = ok("schwab", [SCHWAB_HEAD, sw("03/15/2026", "NRA Tax Adj", "KO", "", "", "", "-$0.77"), sw("03/15/2026", "Qualified Dividend", "MSFT", "", "", "", "$5.10")].join("\n"));
    expect(r.ready.find((x) => x.mapped.type === "DIVIDEND")!.mapped.fee).toBe("0");
    expect(r.ready.find((x) => x.mapped.type === "FEE")!.mapped.ticker).toBe("KO");
  });

  it("a tax refund is skipped; a reversed dividend is skipped", () => {
    const r = ok("schwab", [SCHWAB_HEAD, sw("03/15/2026", "NRA Tax Adj", "KO", "", "", "", "$0.77"), sw("03/15/2026", "Qualified Dividend", "KO", "", "", "", "-$5.10")].join("\n"));
    expect(r.skipped.map((s) => s.code)).toEqual(["tax_refund", "reversal"]);
  });

  it("an oldest-first file is left alone", () => {
    const r = ok("schwab", [SCHWAB_HEAD, sw("01/12/2026", "Buy", "AAPL", "1", "$1.00", "", "-$1.00"), sw("03/02/2026", "Sell", "AAPL", "1", "$2.00", "", "$2.00")].join("\n"));
    expect(r.wasNewestFirst).toBe(false);
    expect(r.ready.map((x) => x.mapped.type)).toEqual(["BUY", "SELL"]);
  });
});

// ---------------------------------------------------------------------------
// Fidelity
// ---------------------------------------------------------------------------

const FID_HEAD = "Run Date,Account,Account Number,Action,Symbol,Security Description,Security Type,Exchange Quantity,Exchange Currency,Quantity,Currency,Price,Exchange Rate,Commission,Fees,Accrued Interest,Amount,Settlement Date";
const fid = (action: string, symbol: string, qty: string, cur: string, price: string, comm: string, fees: string, amount: string, date = "01/12/2026", acct = "X00000000") =>
  `${date},Fidelity Account,${acct}, ${action},${symbol},DESC,Cash,0,,${qty},${cur},${price},,${comm},${fees},,${amount},${date}`;

describe("Fidelity [Beta]", () => {
  it("skips leading blank lines and trailing disclaimer lines", () => {
    const text = ["", "", FID_HEAD, fid("YOU BOUGHT APPLE INC (AAPL) (Cash)", "AAPL", "10", "USD", "205.40", "0", "0", "-2054.00"), "", '"The data and information in this spreadsheet is provided to you solely for your use."', '"Date downloaded 06/30/2026 12:00 pm"'].join("\n");
    const r = ok("fidelity", text);
    expect(r.ready).toHaveLength(1);
    expect(r.ignoredLines).toBe(2);
    expect(r.ready[0].line).toBe(4);
  });

  it("accepts the older '($)' header version (no currency column) and says amounts are US dollars", () => {
    const head = "Run Date,Account,Action,Symbol,Security Description,Security Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date";
    const text = [
      head,
      "01/12/2026,Acct, YOU BOUGHT APPLE INC (AAPL) (Cash),AAPL,APPLE INC,Cash,10,205.40,1.00,0.05,,-2055.05,01/13/2026",
      "03/02/2026,Acct, YOU SOLD APPLE INC (AAPL) (Cash),AAPL,APPLE INC,Cash,-4,214.00,0,0,,856.00,03/03/2026",
    ].join("\n");
    const r = ok("fidelity", text);
    expect(r.currencyAssumed).toEqual({ code: "USD", label: "US dollars" });
    expect(r.ready.map((x) => x.mapped.type)).toEqual(["BUY", "SELL"]);
    expect(r.ready[0].mapped).toMatchObject({ currency: "USD", fee: "1.05", quantity: "10", pricePerUnit: "205.40" });
    expect(r.ready[1].mapped.quantity).toBe("4");
  });

  it("the current header version reads the Currency column and does not assume one", () => {
    const r = ok("fidelity", [FID_HEAD, fid("YOU BOUGHT APPLE INC (AAPL) (Cash)", "AAPL", "10", "USD", "205.40", "0", "0", "-2054.00")].join("\n"));
    expect(r.currencyAssumed).toBeUndefined();
  });

  it("refuses a file without the expected columns", () => {
    const r = refused("fidelity", "Run Date,Action\n1,2");
    expect(r.missingColumns).toEqual(["Symbol", "Quantity", "Price", "Amount"]);
  });

  describe("every action phrase (leading space, any case)", () => {
    const row = (action: string, amount = "-10.00") => fid(action, "AAPL", "1", "USD", "10.00", "0", "0", amount);
    const cases: [string, string, string?][] = [
      ["YOU BOUGHT APPLE INC (AAPL) (Cash)", "BUY"],
      ["you bought apple inc (aapl) (cash)", "BUY"],
      ["YOU SOLD APPLE INC (AAPL) (Cash)", "SELL"],
      ["REINVESTMENT MICROSOFT CORP (MSFT) (Cash)", "skip", "reinvestment"],
      ["STOCK SPLIT NVIDIA CORP (NVDA)", "skip", "split"],
      ["TRANSFERRED FROM ANOTHER ACCOUNT", "skip", "transfer"],
      ["INTEREST EARNED FDIC INSURED DEPOSIT", "skip", "interest"],
      ["SOMETHING ELSE ENTIRELY", "skip", "unknown_word"],
    ];
    for (const [action, expected, code] of cases) {
      it(action, () => {
        const r = ok("fidelity", [FID_HEAD, row(action)].join("\n"));
        if (expected === "skip") {
          expect(r.skipped[0].code).toBe(code);
        } else {
          expect(r.ready[0].mapped.type).toBe(expected);
        }
      });
    }

    it("dividends and their tax lines", () => {
      const r = ok("fidelity", [FID_HEAD, fid("NON-RESIDENT TAX COCA COLA CO (KO) (Cash)", "KO", "0", "USD", "", "", "", "-0.77"), fid("DIVIDEND RECEIVED COCA COLA CO (KO) (Cash)", "KO", "0", "USD", "", "", "", "5.10")].join("\n"));
      expect(r.ready).toHaveLength(1);
      expect(r.ready[0].mapped).toMatchObject({ type: "DIVIDEND", amount: "5.10", fee: "0.77" });
      const foreign = ok("fidelity", [FID_HEAD, fid("FOREIGN TAX PAID COCA COLA CO (KO) (Cash)", "KO", "0", "USD", "", "", "", "-0.77")].join("\n"));
      expect(foreign.ready[0].mapped).toMatchObject({ type: "FEE", note: "Tax withheld" });
    });

    it("cash: the words give the direction and the sign must agree", () => {
      const dep = ok("fidelity", [FID_HEAD, fid("ELECTRONIC FUNDS TRANSFER RECEIVED (Cash)", "", "0", "USD", "", "", "", "5000.00")].join("\n"));
      expect(dep.ready[0].mapped).toMatchObject({ type: "DEPOSIT", amount: "5000.00" });
      const wd = ok("fidelity", [FID_HEAD, fid("ELECTRONIC FUNDS TRANSFER PAID (Cash)", "", "0", "USD", "", "", "", "-500.00")].join("\n"));
      expect(wd.ready[0].mapped).toMatchObject({ type: "WITHDRAWAL", amount: "500.00" });
      const wire = ok("fidelity", [FID_HEAD, fid("WIRE TRANSFER OUT (Cash)", "", "0", "USD", "", "", "", "-500.00")].join("\n"));
      expect(wire.ready[0].mapped.type).toBe("WITHDRAWAL");
      const wrong = ok("fidelity", [FID_HEAD, fid("ELECTRONIC FUNDS TRANSFER RECEIVED (Cash)", "", "0", "USD", "", "", "", "-5.00")].join("\n"));
      expect(wrong.skipped[0].code).toBe("unclear");
    });

    it("fee charged is a FEE entry; a refund is skipped", () => {
      const fee = ok("fidelity", [FID_HEAD, fid("FEE CHARGED ADR FEE", "", "0", "USD", "", "", "", "-3.00")].join("\n"));
      expect(fee.ready[0].mapped).toMatchObject({ type: "FEE", amount: "3.00" });
      const refund = ok("fidelity", [FID_HEAD, fid("FEE CHARGED ADR FEE", "", "0", "USD", "", "", "", "3.00")].join("\n"));
      expect(refund.skipped[0].code).toBe("fee_refund");
    });
  });

  it("fee = commission + fees; a currency the app does not hold is skipped", () => {
    const r = ok("fidelity", [FID_HEAD, fid("YOU SOLD APPLE INC (AAPL) (Cash)", "AAPL", "-4", "USD", "214.00", "0.10", "0.05", "855.85"), fid("YOU BOUGHT BARRICK (ABX) (Cash)", "ABX", "100", "CAD", "20.00", "", "0", "-2000.00")].join("\n"));
    expect(r.ready[0].mapped.fee).toBe("0.15");
    expect(r.skipped[0].reason).toBe("Currency CAD is not supported yet");
  });

  it("options are skipped", () => {
    const r = ok("fidelity", [FID_HEAD, fid("YOU BOUGHT OPENING TRANSACTION CALL (AAPL) (Cash)", "-AAPL260619C220", "1", "USD", "3.20", "", "", "-320.00")].join("\n"));
    expect(r.skipped[0].code).toBe("option");
  });

  it("counts the distinct accounts in the file", () => {
    const r = ok("fidelity", [FID_HEAD, fid("YOU BOUGHT APPLE INC (AAPL) (Cash)", "AAPL", "1", "USD", "1.00", "0", "0", "-1", "01/12/2026", "X1"), fid("YOU BOUGHT APPLE INC (AAPL) (Cash)", "AAPL", "1", "USD", "1.00", "0", "0", "-1", "01/13/2026", "X2")].join("\n"));
    expect(r.accountCount).toBe(2);
    // The account number never reaches the rows that are sent.
    expect(JSON.stringify(r.ready.map((x) => x.mapped))).not.toMatch(/X1|X2/);
  });

  it("dates are month-first", () => {
    const r = ok("fidelity", [FID_HEAD, fid("YOU BOUGHT APPLE INC (AAPL) (Cash)", "AAPL", "1", "USD", "1.00", "0", "0", "-1", "25/01/2026")].join("\n"));
    expect(r.cannotRead[0].reason).toBe("Enter a valid trade date.");
  });
});

// ---------------------------------------------------------------------------
// InvestIQ template
// ---------------------------------------------------------------------------

const TPL_HEAD = "Date,Ticker,Market,Type,Quantity,Price,Amount,Fee,Currency,Note";

describe("InvestIQ template", () => {
  it("reads every type word in any capitalisation", () => {
    const r = ok(
      "template",
      [
        TPL_HEAD,
        "2026-01-05,,,deposit,,,100,,USD,",
        "2026-01-06,AAPL,US,BUY,1,10,,0.5,USD,",
        "2026-01-07,AAPL,US,Sell,1,11,,,USD,",
        "2026-01-08,AAPL,US,DIVIDEND,,,1.50,0,USD,",
        "2026-01-09,,,WithDrawal,,,10,,USD,",
        "2026-01-10,,,fee,,,2,,USD,",
      ].join("\n"),
    );
    expect(r.ready.map((x) => x.mapped.type)).toEqual(["DEPOSIT", "BUY", "SELL", "DIVIDEND", "WITHDRAWAL", "FEE"]);
    expect(r.ready[1].mapped.fee).toBe("0.5");
    expect(r.ready[2].mapped.fee).toBe("0");
  });

  it("dates must be YYYY-MM-DD: anything else says so", () => {
    const r = ok("template", [TPL_HEAD, "14/03/2026,AAPL,US,Buy,1,10,,,USD,", "03/14/2026,AAPL,US,Buy,1,10,,,USD,", "2026-3-4,AAPL,US,Buy,1,10,,,USD,"].join("\n"));
    expect(r.cannotRead).toHaveLength(3);
    expect(r.cannotRead[0].reason).toContain("Use YYYY-MM-DD");
  });

  it("an unknown word is skipped, never a buy", () => {
    const r = ok("template", [TPL_HEAD, "2026-05-25,NVDA,US,Split,,,,,USD,10-for-1 split"].join("\n"));
    expect(r.ready).toHaveLength(0);
    expect(r.skipped[0].reason).toBe("We do not recognise the word 'Split' in this column");
  });

  it("Market is optional and must be a real market name", () => {
    const good = ok("template", [TPL_HEAD, "2026-01-06,BKMB,msx,Buy,1,10,,,OMR,"].join("\n"));
    expect(good.ready[0].mapped.market).toBe("MSX");
    const bad = ok("template", [TPL_HEAD, "2026-01-06,BKMB,NOWHERE,Buy,1,10,,,OMR,"].join("\n"));
    expect(bad.cannotRead[0].reason).toContain("'NOWHERE' is not one we know");
  });

  it("a currency the app does not hold is skipped; negative numbers cannot be read", () => {
    const r = ok("template", [TPL_HEAD, "2026-01-06,ABC,,Buy,10,5.00,,,EUR,", "2026-01-06,AAPL,US,Buy,-1,5.00,,,USD,", "2026-01-06,AAPL,US,Buy,1,5.00,,-2,USD,"].join("\n"));
    expect(r.skipped[0].code).toBe("currency");
    expect(r.cannotRead.map((c) => c.reason)).toEqual(["Quantity must be greater than zero.", "Fee cannot be negative."]);
  });

  it("a Buy without a ticker cannot be read", () => {
    const r = ok("template", [TPL_HEAD, "2026-01-06,,,Buy,1,5.00,,,USD,"].join("\n"));
    expect(r.cannotRead[0].reason).toBe("Type 'BUY' requires a Ticker.");
  });

  it("refuses a file that is not the template", () => {
    expect(refused("template", "a,b\n1,2").missingColumns).toEqual(["Date", "Ticker", "Type", "Quantity", "Price", "Amount", "Currency"]);
  });

  it("keeps the person's own note, else says where it came from", () => {
    const r = ok("template", [TPL_HEAD, "2026-01-06,AAPL,US,Buy,1,5.00,,,USD,my note", "2026-01-07,AAPL,US,Buy,1,5.00,,,USD,"].join("\n"));
    expect(r.ready.map((x) => x.mapped.note)).toEqual(["my note", "Imported from InvestIQ template"]);
  });
});

// ---------------------------------------------------------------------------
// File plumbing shared by every preset
// ---------------------------------------------------------------------------

describe("byte-order mark, delimiters and empty files", () => {
  const body = [TPL_HEAD, "2026-01-06,AAPL,US,Buy,1,5.00,,,USD,"];

  it("strips a byte-order mark", () => {
    expect(ok("template", "\uFEFF" + body.join("\n")).ready).toHaveLength(1);
  });

  it("reads a semicolon file", () => {
    expect(ok("template", body.join("\n").replace(/,/g, ";")).ready).toHaveLength(1);
  });

  it("reads a tab file", () => {
    expect(ok("template", body.join("\n").replace(/,/g, "\t")).ready).toHaveLength(1);
  });

  it("reads Windows line endings", () => {
    expect(ok("template", body.join("\r\n") + "\r\n").ready).toHaveLength(1);
  });

  it("an empty file or a header-only file is refused, not a crash", () => {
    expect(refused("template", "").reason).toBe("empty");
    expect(refused("template", TPL_HEAD).reason).toBe("no_rows");
  });

  it("a broken quote gives a plain message", () => {
    expect(refused("template", TPL_HEAD + '\n2026-01-06,"AAPL,US').reason).toBe("parse_error");
  });
});

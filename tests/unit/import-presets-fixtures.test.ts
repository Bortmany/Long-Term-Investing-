// Broker-file presets: every staged fixture file, end to end.
//
// Core-guarantee tests (golden rule): no number is invented, a row the preset
// is unsure about is skipped (never imported), a newest-first file comes out
// oldest first with no oversell, sending the same file twice adds nothing,
// and nothing skipped or unreadable ever reaches the server.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyOversellProjection,
  validateMappedRows,
  type KnownInstrument,
  type MappedImportRow,
} from "@/lib/import-rows";
import {
  prepareUpload,
  readBrokerFile,
  type PresetId,
  type ReadOk,
  type ReadyRow,
} from "@/lib/import-presets";

const FIXTURES = path.join(__dirname, "..", "fixtures", "brokers");
function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}

// The same tickers the seed catalogue holds, plus the two Gulf examples.
const INSTRUMENTS: KnownInstrument[] = [
  { id: "i-aapl", ticker: "AAPL", market: "US", currency: "USD" },
  { id: "i-msft", ticker: "MSFT", market: "US", currency: "USD" },
  { id: "i-ko", ticker: "KO", market: "US", currency: "USD" },
  { id: "i-bkmb", ticker: "BKMB", market: "MSX", currency: "OMR" },
  { id: "i-2222", ticker: "2222.SR", market: "TADAWUL", currency: "SAR" },
];

type Case = {
  file: string;
  preset: PresetId;
  ready: number;
  skipped: number;
  withNote?: number;
  newestFirst?: boolean;
};

const CASES: Case[] = [
  { file: "trading212.csv", preset: "trading212", ready: 9, skipped: 3, withNote: 1 },
  { file: "ibkr-activity.csv", preset: "ibkr", ready: 7, skipped: 4 },
  { file: "ibkr-flex.csv", preset: "ibkr", ready: 3, skipped: 2 },
  { file: "saxo.csv", preset: "saxo", ready: 4, skipped: 3 },
  { file: "etoro.csv", preset: "etoro", ready: 7, skipped: 1, newestFirst: true },
  { file: "schwab.csv", preset: "schwab", ready: 8, skipped: 2, newestFirst: true },
  { file: "fidelity.csv", preset: "fidelity", ready: 7, skipped: 3, newestFirst: true },
  { file: "template-gulf.csv", preset: "template", ready: 8, skipped: 2 },
];

function readOk(c: Case): ReadOk {
  const result = readBrokerFile(c.preset, fixture(c.file), { fileName: c.file });
  if (!result.ok) throw new Error(`${c.file} refused: ${result.message}`);
  return result;
}

function plan(reads: ReadOk[], known: string[] = []) {
  return prepareUpload(reads, { instruments: INSTRUMENTS, knownReferences: known });
}

function validate(rows: ReadyRow[]) {
  const mapped: MappedImportRow[] = rows.map((r) => r.mapped);
  const report = validateMappedRows(mapped, INSTRUMENTS);
  applyOversellProjection(report, new Map());
  return report;
}

describe("broker fixtures: counts and zero unreadable rows", () => {
  for (const c of CASES) {
    it(`${c.file}: ${c.ready} ready, ${c.skipped} skipped, 0 cannot read`, () => {
      const p = plan([readOk(c)]);
      expect(p.needsFixing).toEqual([]);
      expect(p.ready).toHaveLength(c.ready);
      expect(p.skipped).toHaveLength(c.skipped);
      expect(p.withNote).toHaveLength(c.withNote ?? 0);
      expect(p.alreadyImported).toHaveLength(0);
      expect(p.untrackedTickers).toEqual([]);
    });

    it(`${c.file}: the shared validation accepts every ready row, with no oversell`, () => {
      const p = plan([readOk(c)]);
      const report = validate(p.ready);
      const failures = report.results.filter((r) => !r.ok);
      expect(failures).toEqual([]);
      expect(report.errorCount).toBe(0);
    });

    it(`${c.file}: turns the list around when it is newest first`, () => {
      const read = readOk(c);
      expect(read.wasNewestFirst).toBe(c.newestFirst ?? false);
      const dates = read.ready.map((r) => r.mapped.tradeDate);
      expect(dates).toEqual([...dates].sort());
    });
  }
});

describe("newest-first fixtures keep the broker file's own line numbers", () => {
  it("Schwab: the SELL is handed over after its BUY, but keeps its file line (line 10 is the sell row)", () => {
    const read = readOk(CASES.find((c) => c.file === "schwab.csv")!);
    const types = read.ready.map((r) => `${r.mapped.type}:${r.mapped.ticker ?? ""}`);
    expect(types.indexOf("BUY:AAPL")).toBeLessThan(types.indexOf("SELL:AAPL"));
    const sell = read.ready.find((r) => r.mapped.type === "SELL")!;
    // Title line, header, then rows newest first: split(3) MoneyLink(4) option(5) MSFT(6)
    // tax(7) dividend(8) SELL(9).
    expect(sell.line).toBe(9);
    expect(sell.raw).toContain("APPLE INC");
  });

  it("Fidelity: skips leading blank lines and counts physical lines", () => {
    const read = readOk(CASES.find((c) => c.file === "fidelity.csv")!);
    const sell = read.ready.find((r) => r.mapped.type === "SELL")!;
    // Two blank lines, header on line 3, first row on line 4; the SELL is the 7th data row.
    expect(sell.line).toBe(10);
  });

  it("eToro: oldest first with the trade times used inside a day", () => {
    const read = readOk(CASES.find((c) => c.file === "etoro.csv")!);
    const order = read.ready.map((r) => r.mapped.tradeDate);
    expect(order[0]).toBe("2026-01-05");
    expect(order[order.length - 1]).toBe("2026-05-20");
  });
});

describe("what the fixtures import, exactly", () => {
  it("Trading 212: the dividend is 4.33 + 0.77 = 5.10 gross with 0.77 as the fee", () => {
    const read = readOk(CASES[0]);
    const dividend = read.ready.find((r) => r.mapped.type === "DIVIDEND")!;
    expect(dividend.mapped.amount).toBe("5.10");
    expect(dividend.mapped.fee).toBe("0.77");
  });

  it("Trading 212: the EUR fee row imports with fee 0 and a note", () => {
    const read = readOk(CASES[0]);
    const noted = read.ready.find((r) => r.importNote)!;
    expect(noted.mapped.ticker).toBe("AAPL");
    expect(noted.mapped.fee).toBe("0");
    expect(noted.importNote).toContain("0.30 EUR");
  });

  it("Trading 212: the fractional-seconds row is read as 2026-05-04", () => {
    const read = readOk(CASES[0]);
    const row = read.ready.find((r) => r.mapped.ticker === "MSFT" && r.mapped.tradeDate === "2026-05-04");
    expect(row).toBeTruthy();
    expect(row!.mapped.quantity).toBe("1");
  });

  it("Trading 212: the Finra fee on the sell becomes the fee, and Result is ignored", () => {
    const sell = readOk(CASES[0]).ready.find((r) => r.mapped.type === "SELL")!;
    expect(sell.mapped.fee).toBe("0.02");
    expect(JSON.stringify(sell.mapped)).not.toContain("17.20");
  });

  it("Saxo: reads the Event text; comma decimals never matter for trades", () => {
    const read = readOk(CASES.find((c) => c.file === "saxo.csv")!);
    const buy = read.ready.find((r) => r.mapped.ticker === "AAPL" && r.mapped.type === "BUY")!;
    expect(buy.mapped.quantity).toBe("10");
    expect(buy.mapped.pricePerUnit).toBe("205.40");
    expect(buy.mapped.tradeDate).toBe("2026-01-12");
    expect(buy.reference).toBe("saxo:O0000001");
    const reasons = read.skipped.map((s) => s.reason).join(" | ");
    expect(reasons).toContain("Currency EUR is not supported yet");
  });

  it("eToro: price worked out from amount and units, thousands commas read, dashes empty", () => {
    const read = readOk(CASES.find((c) => c.file === "etoro.csv")!);
    const aaplBuy = read.ready.find((r) => r.mapped.type === "BUY" && r.mapped.ticker === "AAPL")!;
    expect(aaplBuy.mapped.quantity).toBe("10");
    expect(Number(aaplBuy.mapped.pricePerUnit)).toBeCloseTo(205.4, 8);
    expect(aaplBuy.derivedPrice).toBe(true);
    const sell = read.ready.find((r) => r.mapped.type === "SELL")!;
    expect(Number(sell.mapped.pricePerUnit)).toBe(214);
    const dividend = read.ready.find((r) => r.mapped.type === "DIVIDEND")!;
    expect(dividend.mapped.amount).toBe("4.33");
    expect(dividend.mapped.fee).toBe("0");
    expect(read.skipped[0].code).toBe("asset_kind");
  });

  it("Schwab: an 'as of' row is dated by the FIRST (posted) date", () => {
    const read = readOk(CASES.find((c) => c.file === "schwab.csv")!);
    const msftBuy = read.ready.find((r) => r.mapped.ticker === "MSFT" && r.mapped.tradeDate === "2026-03-17");
    expect(msftBuy).toBeTruthy();
    const dividend = read.ready.find((r) => r.mapped.type === "DIVIDEND")!;
    expect(dividend.mapped.tradeDate).toBe("2026-03-15");
    expect(dividend.mapped.amount).toBe("5.10");
    expect(dividend.mapped.fee).toBe("0.77");
    expect(read.absorbedLines).toBe(1);
    // Title line and the totals line.
    expect(read.ignoredLines).toBe(2);
  });

  it("Fidelity: the tax line is folded into the dividend; disclaimers are ignored", () => {
    const read = readOk(CASES.find((c) => c.file === "fidelity.csv")!);
    const dividend = read.ready.find((r) => r.mapped.type === "DIVIDEND")!;
    expect(dividend.mapped.amount).toBe("5.10");
    expect(dividend.mapped.fee).toBe("0.77");
    expect(read.absorbedLines).toBe(1);
    expect(read.accountCount).toBe(1);
    const sell = read.ready.find((r) => r.mapped.type === "SELL")!;
    expect(sell.mapped.quantity).toBe("4");
    expect(sell.mapped.fee).toBe("0.05");
    expect(read.skipped.map((s) => s.code).sort()).toEqual(["currency", "reinvestment", "split"]);
  });

  it("IBKR Activity Statement: dividend 2.40 with 0.36 tax, fee 4.50, ignored sections named", () => {
    const read = readOk(CASES.find((c) => c.file === "ibkr-activity.csv")!);
    expect(read.layout).toBe("activity");
    const dividend = read.ready.find((r) => r.mapped.type === "DIVIDEND")!;
    expect(dividend.mapped.amount).toBe("2.40");
    expect(dividend.mapped.fee).toBe("0.36");
    const fee = read.ready.find((r) => r.mapped.type === "FEE")!;
    expect(fee.mapped.amount).toBe("4.50");
    expect(fee.mapped.ticker).toBeUndefined();
    expect(read.ignoredSections).toEqual(expect.arrayContaining(["Statement", "Account Information", "Net Asset Value"]));
    expect(read.skipped.map((s) => s.code).sort()).toEqual(["currency", "interest", "option", "split"]);
    const sell = read.ready.find((r) => r.mapped.type === "SELL")!;
    expect(sell.mapped.quantity).toBe("4");
    expect(sell.mapped.fee).toBe("1.00");
  });

  it("IBKR Flex: reads Buy/Sell and YYYYMMDD and uses TransactionID as the reference", () => {
    const read = readOk(CASES.find((c) => c.file === "ibkr-flex.csv")!);
    expect(read.layout).toBe("flex");
    expect(read.ready.map((r) => r.reference)).toEqual([
      "ibkr:900000001",
      "ibkr:900000002",
      "ibkr:900000003",
    ]);
    expect(read.ready[0].mapped.tradeDate).toBe("2026-01-12");
  });

  it("Template: Gulf tickers resolve ('2222.SR' on TADAWUL), the skipped words are named", () => {
    const p = plan([readOk(CASES.find((c) => c.file === "template-gulf.csv")!)]);
    const aramco = p.ready.find((r) => r.mapped.ticker === "2222.SR" && r.mapped.type === "BUY")!;
    expect(aramco.mapped.market).toBe("TADAWUL");
    expect(aramco.mapped.currency).toBe("SAR");
    const reasons = p.skipped.map((s) => s.reason);
    expect(reasons).toContain("We do not recognise the word 'Split' in this column");
    expect(reasons).toContain("Currency EUR is not supported yet");
  });
});

describe("the downloadable template", () => {
  it("imports cleanly through the template preset", () => {
    const text = readFileSync(path.join(__dirname, "..", "..", "public", "broker-template.csv"), "utf8");
    const read = readBrokerFile("template", text);
    if (!read.ok) throw new Error(read.message);
    const p = plan([read]);
    expect(p.ready).toHaveLength(2);
    expect(p.needsFixing).toEqual([]);
    expect(p.skipped).toEqual([]);
    expect(validate(p.ready).errorCount).toBe(0);
  });
});

describe("a broker ticker '2222' matches the tracked '2222.SR' on the hinted market", () => {
  it("only when the market is named", () => {
    const text = [
      "Date,Ticker,Market,Type,Quantity,Price,Amount,Fee,Currency,Note",
      "2026-02-03,2222,TADAWUL,Buy,40,25.10,,5.00,SAR,",
      "2026-02-04,2222,,Buy,10,25.10,,5.00,SAR,",
    ].join("\n");
    const read = readBrokerFile("template", text);
    if (!read.ok) throw new Error(read.message);
    const p = plan([read]);
    expect(p.ready).toHaveLength(1);
    expect(p.ready[0].mapped.ticker).toBe("2222.SR");
    expect(p.needsFixing).toHaveLength(1);
    expect(p.untrackedTickers).toEqual(["2222"]);
  });
});

describe("duplicates: sending the same file twice adds nothing", () => {
  for (const c of CASES) {
    it(`${c.file}: a second import finds every row already imported`, () => {
      const first = plan([readOk(c)]);
      const known = first.ready.map((r) => r.reference);
      const second = plan([readOk(c)], known);
      expect(second.ready).toHaveLength(0);
      expect(second.serverRows).toHaveLength(0);
      expect(second.alreadyImported).toHaveLength(first.ready.length);
    });
  }

  it("the same file twice in one upload counts each row once (Trading 212)", () => {
    const c = CASES[0];
    const p = plan([readOk(c), readOk(c)]);
    expect(p.ready).toHaveLength(c.ready);
    expect(p.alreadyImported).toHaveLength(c.ready);
  });

  it("two identical fills in one file stay two rows, and re-importing drops both", () => {
    const text = [
      "Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount",
      '"02/03/2026","Buy","AAPL","APPLE INC","5","$205.40","","-$1,027.00"',
      '"02/03/2026","Buy","AAPL","APPLE INC","5","$205.40","","-$1,027.00"',
    ].join("\n");
    const read = readBrokerFile("schwab", text);
    if (!read.ok) throw new Error(read.message);
    const p = plan([read]);
    expect(p.ready).toHaveLength(2);
    expect(new Set(p.ready.map((r) => r.reference)).size).toBe(2);
    const again = plan([read], p.ready.map((r) => r.reference));
    expect(again.ready).toHaveLength(0);
    expect(again.alreadyImported).toHaveLength(2);
  });
});

describe("what reaches the server", () => {
  it("never includes a skipped row, an unreadable row or a raw line", () => {
    for (const c of CASES) {
      const read = readOk(c);
      const p = plan([read]);
      const sentLines = new Set(p.serverRows.map((r) => r.line));
      for (const s of read.skipped) expect(sentLines.has(s.line)).toBe(false);
      expect(p.serverRows).toHaveLength(p.ready.length);
      for (const row of p.serverRows) {
        expect(Object.keys(row).sort()).toEqual(expect.arrayContaining(["line", "mapped", "reference"]));
        expect(JSON.stringify(row)).not.toMatch(/XXXX-1234|X00000000|U0000000|JANE SAMPLE/);
      }
    }
  });

  it("notes are only 'Imported from <broker>' (or the tax note)", () => {
    for (const c of CASES) {
      if (c.preset === "template") continue;
      const read = readOk(c);
      for (const row of read.ready) {
        expect(row.mapped.note).toMatch(/^(Imported from .+|Tax withheld)$/);
      }
    }
  });

  it("an unrecognised action word is skipped and never becomes a buy", () => {
    const text = [
      "Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount",
      '"02/03/2026","Banana Split","AAPL","APPLE INC","5","$205.40","","-$1,027.00"',
    ].join("\n");
    const read = readBrokerFile("schwab", text);
    if (!read.ok) throw new Error(read.message);
    expect(read.ready).toHaveLength(0);
    expect(read.skipped[0].code).toBe("unknown_word");
    expect(read.skipped[0].reason).toBe("We do not recognise the word 'Banana Split' in this column");
  });
});

describe("Arabic text in cells", () => {
  it("does not crash and never reaches the notes", () => {
    const text = [
      "Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount",
      '"02/03/2026","Buy","AAPL","شركة أبل","5","$205.40","","-$1,027.00"',
      '"02/04/2026","شراء","AAPL","شركة أبل","5","$205.40","","-$1,027.00"',
      '"02/05/2026","Buy","AAPL","x","٥","$205.40","","-$1,027.00"',
    ].join("\n");
    const read = readBrokerFile("schwab", text);
    if (!read.ok) throw new Error(read.message);
    expect(read.ready).toHaveLength(1);
    expect(read.ready[0].mapped.note).toBe("Imported from Charles Schwab");
    expect(read.skipped).toHaveLength(1);
    // Arabic-Indic digits are never converted by guesswork.
    expect(read.cannotRead).toHaveLength(1);
    expect(read.cannotRead[0].reason).toBe("Enter a quantity as a number.");
  });
});

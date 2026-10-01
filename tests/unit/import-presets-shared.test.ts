// Broker-file presets: the shared building blocks (number and date readers,
// file text handling, references, ordering, symbol matching, upload checks).

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRESET_CARDS,
  checkUploadedFile,
  detectPresets,
  getPresetCard,
  resolveBrokerSymbol,
  splitAlreadyImported,
  translateExchange,
} from "@/lib/import-presets";
import { realMarketNames, supportedCurrencies } from "@/lib/import-presets/lists";
import {
  addDecimals,
  assignReferences,
  detectDelimiter,
  divideDecimals,
  loadTable,
  orderOldestFirst,
  readDate,
  readNumber,
} from "@/lib/import-presets/shared";
import type { ReadyRow } from "@/lib/import-presets";

describe("number reader", () => {
  it("plain style", () => {
    expect(readNumber("205.40", "plain")).toEqual({ ok: true, value: "205.40" });
    expect(readNumber("-300.00", "plain")).toEqual({ ok: true, value: "-300.00" });
    expect(readNumber("1,000", "plain").ok).toBe(false);
    expect(readNumber("$5", "plain").ok).toBe(false);
  });

  it("US style: dollar sign, thousands commas, negatives", () => {
    expect(readNumber("$2,054.00", "us")).toEqual({ ok: true, value: "2054.00" });
    expect(readNumber("-$12.00", "us")).toEqual({ ok: true, value: "-12.00" });
    expect(readNumber("1,234,567", "us")).toEqual({ ok: true, value: "1234567" });
    expect(readNumber("1,23", "us").ok).toBe(false);
    expect(readNumber("12,34,56", "us").ok).toBe(false);
  });

  it("comma-decimal style", () => {
    expect(readNumber("-422,99", "eu")).toEqual({ ok: true, value: "-422.99" });
    expect(readNumber("1.234,56", "eu")).toEqual({ ok: true, value: "1234.56" });
    expect(readNumber("422.99", "eu").ok).toBe(false);
  });

  it("never reads text that only looks like a number", () => {
    for (const bad of ["", "abc", "12abc", "1e5", "1.2.3", "--5", "٥", "١٢٣", "5 USD", "NaN"]) {
      expect(readNumber(bad, "us").ok).toBe(false);
      expect(readNumber(bad, "plain").ok).toBe(false);
      expect(readNumber(bad, "eu").ok).toBe(false);
    }
  });
});

describe("date reader (day-first versus month-first is never guessed)", () => {
  it("reads each declared format to YYYY-MM-DD", () => {
    expect(readDate("2026-03-14", "YYYY-MM-DD")).toEqual({ ok: true, date: "2026-03-14" });
    expect(readDate("20260314", "YYYYMMDD")).toEqual({ ok: true, date: "2026-03-14" });
    expect(readDate("03/14/2026", "MM/DD/YYYY")).toEqual({ ok: true, date: "2026-03-14" });
    expect(readDate("14/03/2026", "DD/MM/YYYY")).toEqual({ ok: true, date: "2026-03-14" });
    expect(readDate("30-Dec-2024", "DD-MMM-YYYY")).toEqual({ ok: true, date: "2024-12-30" });
    expect(readDate("5-jan-2026", "DD-MMM-YYYY")).toEqual({ ok: true, date: "2026-01-05" });
  });

  it("refuses a day or month in the wrong place instead of swapping", () => {
    expect(readDate("14/03/2026", "MM/DD/YYYY").ok).toBe(false);
    expect(readDate("03/14/2026", "DD/MM/YYYY").ok).toBe(false);
    expect(readDate("14-03-2026", "YYYY-MM-DD").ok).toBe(false);
  });

  it("does not fix dates that are not on the calendar", () => {
    expect(readDate("2026-02-30", "YYYY-MM-DD").ok).toBe(false);
    expect(readDate("2026-13-01", "YYYY-MM-DD").ok).toBe(false);
    expect(readDate("2026-00-10", "YYYY-MM-DD").ok).toBe(false);
    expect(readDate("29-Feb-2026", "DD-MMM-YYYY").ok).toBe(false);
    expect(readDate("29-Feb-2028", "DD-MMM-YYYY").ok).toBe(true);
    expect(readDate("12-Foo-2026", "DD-MMM-YYYY").ok).toBe(false);
  });

  it("reads times only when allowed: fractional seconds, ISO, zone", () => {
    expect(readDate("2023-12-18 14:30:03.613", "YYYY-MM-DD", true)).toEqual({
      ok: true,
      date: "2023-12-18",
      time: "14:30:03",
    });
    expect(readDate("2023-12-18T14:30:03Z", "YYYY-MM-DD", true).ok).toBe(true);
    expect(readDate("2023-12-18T14:30:03+02:00", "YYYY-MM-DD", true).ok).toBe(true);
    expect(readDate("2026-01-12, 09:45:31", "YYYY-MM-DD", true)).toMatchObject({ date: "2026-01-12" });
    expect(readDate("2023-12-18 14:30:03", "YYYY-MM-DD", false).ok).toBe(false);
    expect(readDate("2023-12-18 25:00:00", "YYYY-MM-DD", true).ok).toBe(false);
  });

  it("does not read Arabic-Indic digits", () => {
    expect(readDate("٢٠٢٦-٠١-٠٥", "YYYY-MM-DD").ok).toBe(false);
  });
});

describe("exact decimals", () => {
  it("adds without floating-point noise", () => {
    expect(addDecimals("4.33", "0.77")).toBe("5.10");
    expect(addDecimals("0.1", "0.2")).toBe("0.3");
    expect(addDecimals("0", "0.36")).toBe("0.36");
  });
  it("divides to a trimmed result", () => {
    expect(divideDecimals("856.00", "4")).toBe("214");
    expect(divideDecimals("2054.00", "10")).toBe("205.4");
    expect(divideDecimals("1", "3")).toBe("0.33333333");
    expect(divideDecimals("1", "0")).toBeNull();
  });
});

describe("file text handling", () => {
  it("strips a byte-order mark before reading headers", () => {
    const result = loadTable("﻿Date,Type\n2026-01-01,Buy\n");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.table.records[0].cells[0]).toBe("Date");
  });

  it("accepts semicolon and tab files (first line has no commas)", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter('"a;b"\n1')).toBe(",");
    const semi = loadTable("Date;Amount\n2026-01-01;-422,99\n");
    expect(semi.ok && semi.table.records[1].cells).toEqual(["2026-01-01", "-422,99"]);
    const tab = loadTable("Date\tAmount\n2026-01-01\t5\n");
    expect(tab.ok && tab.table.records[1].cells).toEqual(["2026-01-01", "5"]);
  });

  it("remembers the real line number of every record, blanks and multi-line cells included", () => {
    const text = '\n\nDate,Note\n2026-01-01,"two\nlines"\n\n2026-01-02,x\n';
    const result = loadTable(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.table.records.map((r) => r.line)).toEqual([3, 4, 7]);
    }
  });

  it("reports an empty file and a broken quote without throwing", () => {
    expect(loadTable("")).toMatchObject({ ok: false, reason: "empty" });
    expect(loadTable("  \n \n")).toMatchObject({ ok: false, reason: "empty" });
    expect(loadTable('a,b\n"oops,2\n')).toMatchObject({ ok: false, reason: "parse_error" });
  });
});

describe("import references", () => {
  function row(over: Partial<ReadyRow["mapped"]>, stableId?: string): ReadyRow {
    return {
      kind: "ready",
      line: 1,
      raw: "",
      reference: "",
      stableId,
      mapped: { type: "BUY", ticker: "AAPL", quantity: "1", pricePerUnit: "10", tradeDate: "2026-01-01", note: "x", ...over },
    };
  }

  it("uses the broker id when there is one; repeats of the same id get #2", () => {
    const rows = [row({}, "A1"), row({}, "A1"), row({}, "B2")];
    assignReferences("saxo", rows);
    expect(rows.map((r) => r.reference)).toEqual(["saxo:A1", "saxo:A1#2", "saxo:B2"]);
  });

  it("otherwise uses a fingerprint with a counter for identical rows", () => {
    const rows = [row({}), row({}), row({ quantity: "2" })];
    assignReferences("schwab", rows);
    expect(rows[0].reference).toMatch(/^schwab:h:[0-9a-z]+#1$/);
    expect(rows[1].reference).toBe(rows[0].reference.replace(/#1$/, "#2"));
    expect(rows[2].reference).toMatch(/#1$/);
    expect(rows[2].reference).not.toBe(rows[0].reference);
  });

  it("the same values always give the same reference", () => {
    const a = [row({})];
    const b = [row({})];
    assignReferences("schwab", a);
    assignReferences("schwab", b);
    expect(a[0].reference).toBe(b[0].reference);
  });

  it("the note and the broker's account never change the fingerprint", () => {
    const a = [row({ note: "one" })];
    const b = [row({ note: "two" })];
    assignReferences("schwab", a);
    assignReferences("schwab", b);
    expect(a[0].reference).toBe(b[0].reference);
  });

  it("drops known references and repeats inside one upload", () => {
    const rows = [{ reference: "a" }, { reference: "b" }, { reference: "a" }, { reference: "c" }];
    const { fresh, already } = splitAlreadyImported(rows, ["b"]);
    expect(fresh.map((r) => r.reference)).toEqual(["a", "c"]);
    expect(already.map((r) => r.reference)).toEqual(["b", "a"]);
  });
});

describe("ordering: oldest first, true order kept for same-day rows", () => {
  function r(date: string, tag: string, time?: string): ReadyRow {
    return {
      kind: "ready",
      line: Number(tag),
      raw: tag,
      reference: tag,
      sortTime: time,
      mapped: { type: "BUY", tradeDate: date, note: tag },
    };
  }

  it("reverses a newest-first list, then sorts by date", () => {
    // File order (newest first): two rows on 03-02 where "2" (the sell) came after "1" in real life.
    const file = [r("2026-03-02", "2"), r("2026-03-02", "1"), r("2026-01-01", "0")];
    const { rows, newestFirst } = orderOldestFirst(file, "detect-newest");
    expect(newestFirst).toBe(true);
    expect(rows.map((x) => x.raw)).toEqual(["0", "1", "2"]);
  });

  it("leaves an oldest-first list alone", () => {
    const file = [r("2026-01-01", "0"), r("2026-03-02", "1"), r("2026-03-02", "2")];
    const { rows, newestFirst } = orderOldestFirst(file, "detect-newest");
    expect(newestFirst).toBe(false);
    expect(rows.map((x) => x.raw)).toEqual(["0", "1", "2"]);
  });

  it("uses the time of day inside a day when the file has it", () => {
    const file = [r("2026-03-02", "b", "16:00:00"), r("2026-03-02", "a", "09:00:00")];
    const { rows } = orderOldestFirst(file, "oldest");
    expect(rows.map((x) => x.raw)).toEqual(["a", "b"]);
  });
});

describe("exchange words and symbol matching", () => {
  it("translates broker exchange words and ignores the rest", () => {
    expect(translateExchange("XNAS")).toBe("US");
    expect(translateExchange("xnys")).toBe("US");
    expect(translateExchange("NASDAQ")).toBe("US");
    expect(translateExchange("XMUS")).toBe("MSX");
    expect(translateExchange("XSAU")).toBe("TADAWUL");
    expect(translateExchange("XLON")).toBeUndefined();
    expect(translateExchange("")).toBeUndefined();
    expect(translateExchange(undefined)).toBeUndefined();
  });

  it("only ever returns a market the app really has", () => {
    const real = realMarketNames();
    for (const word of ["XNAS", "XNYS", "XMUS", "XSAU", "XDFM", "XADS", "DSMD", "NASDAQ", "TADAWUL", "QSE", "ADX"]) {
      const m = translateExchange(word);
      if (m !== undefined) expect(real).toContain(m);
    }
  });

  const instruments = [
    { ticker: "AAPL", market: "US" },
    { ticker: "KO", market: "US" },
    { ticker: "KO", market: "MSX" },
    { ticker: "2222.SR", market: "TADAWUL" },
    { ticker: "BKMB", market: "MSX" },
  ];

  it("matches exact tickers", () => {
    expect(resolveBrokerSymbol("aapl", undefined, instruments)).toEqual({ kind: "matched", ticker: "AAPL", market: "US" });
    expect(resolveBrokerSymbol("ZZZ", undefined, instruments)).toEqual({ kind: "untracked" });
  });

  it("'2222' matches '2222.SR' only on the hinted market", () => {
    expect(resolveBrokerSymbol("2222", "TADAWUL", instruments)).toEqual({
      kind: "matched",
      ticker: "2222.SR",
      market: "TADAWUL",
    });
    expect(resolveBrokerSymbol("2222", undefined, instruments)).toEqual({ kind: "untracked" });
    expect(resolveBrokerSymbol("2222", "US", instruments)).toEqual({ kind: "untracked" });
  });

  it("a ticker on several markets is left for the shared check unless a market is hinted", () => {
    expect(resolveBrokerSymbol("KO", undefined, instruments)).toEqual({ kind: "ambiguous" });
    expect(resolveBrokerSymbol("KO", "MSX", instruments)).toEqual({ kind: "matched", ticker: "KO", market: "MSX" });
  });
});

describe("Excel, big and non-CSV files get a friendly message", () => {
  it("catches Excel by its name", () => {
    const check = checkUploadedFile({ name: "Account Statement.XLSX", size: 1000 });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.kind).toBe("excel");
      expect(check.title).toBe("This is an Excel file");
      expect(check.message).toBe("Open it, choose File, Save As, CSV (UTF-8), then drop the CSV here.");
    }
    expect(checkUploadedFile({ name: "old.xls" })).toMatchObject({ ok: false, kind: "excel" });
  });

  it("catches Excel by its first bytes even when the name says csv", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(checkUploadedFile({ name: "history.csv", head: zip })).toMatchObject({ ok: false, kind: "excel" });
    expect(checkUploadedFile({ name: "history.csv", head: "PK\u0003\u0004abc" })).toMatchObject({ kind: "excel" });
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(checkUploadedFile({ name: "history.csv", head: ole })).toMatchObject({ kind: "excel" });
  });

  it("adds the sheet hint for eToro and Saxo", () => {
    expect(checkUploadedFile({ name: "a.xlsx" }, "etoro")).toMatchObject({ extra: "Save the 'Account Activity' sheet." });
    expect(checkUploadedFile({ name: "a.xlsx" }, "saxo")).toMatchObject({ extra: "Save the transaction sheet." });
    const plain = checkUploadedFile({ name: "a.xlsx" }, "schwab");
    expect(plain.ok).toBe(false);
    if (!plain.ok) expect(plain.extra).toBeUndefined();
  });

  it("refuses files over 5 MB and files that are not text", () => {
    expect(checkUploadedFile({ name: "a.csv", size: 5 * 1024 * 1024 + 1 })).toMatchObject({ kind: "too_big" });
    expect(checkUploadedFile({ name: "a.pdf" })).toMatchObject({ kind: "not_csv" });
    expect(checkUploadedFile({ name: "a.csv", head: "%PDF-1.7" })).toMatchObject({ kind: "not_csv" });
    expect(checkUploadedFile({ name: "a.csv", head: new Uint8Array([65, 0, 66]) })).toMatchObject({ kind: "not_csv" });
  });

  it("lets a normal CSV through", () => {
    expect(checkUploadedFile({ name: "history.csv", size: 4000, head: "Action,Time" })).toEqual({ ok: true });
  });
});

describe("the card list for Screen 1", () => {
  it("has the eight cards in the spec order", () => {
    expect(PRESET_CARDS.map((c) => c.id)).toEqual([
      "ibkr",
      "saxo",
      "trading212",
      "etoro",
      "schwab",
      "fidelity",
      "template",
      "other",
    ]);
  });

  it("flags the Beta presets and gives steps to every real preset", () => {
    expect(PRESET_CARDS.filter((c) => c.beta).map((c) => c.id)).toEqual(["saxo", "etoro", "fidelity"]);
    for (const card of PRESET_CARDS.filter((c) => c.id !== "other")) {
      expect(card.steps.length).toBeGreaterThanOrEqual(3);
      expect(card.steps.length).toBeLessThanOrEqual(5);
      expect(card.hint.length).toBeGreaterThan(10);
      expect(card.fileDescription.length).toBeGreaterThan(3);
    }
    expect(getPresetCard("trading212").multiFile).toBe(true);
    expect(getPresetCard("template").templateDownload).toBe("/broker-template.csv");
    expect(getPresetCard("ibkr").betaDetail).toContain("Activity Statement");
  });

  it("says which cards read amounts as US dollars", () => {
    expect(getPresetCard("etoro").fixedCurrencyNote).toBe("Amounts in this file are read as US dollars.");
    expect(getPresetCard("schwab").fixedCurrencyNote).toBe("Amounts in this file are read as US dollars.");
    expect(getPresetCard("trading212").fixedCurrencyNote).toBeUndefined();
  });

  it("detects which preset a file looks like", () => {
    const t212 = readFileSync(path.join(__dirname, "..", "fixtures", "brokers", "trading212.csv"), "utf8");
    expect(detectPresets(t212)).toEqual(["trading212"]);
    expect(detectPresets("hello,world\n1,2")).toEqual([]);
  });
});

describe("presets read the currency and market lists at run time", () => {
  const dir = path.join(__dirname, "..", "..", "src", "lib", "import-presets");
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));

  function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");
  }

  it("no preset file names a market or a Gulf currency (outside the exchange table and comments)", () => {
    for (const f of files) {
      if (f === "exchange-map.ts") continue;
      const code = withoutComments(readFileSync(path.join(dir, f), "utf8"));
      expect(code, f).not.toMatch(/TADAWUL|\bMSX\b|\bOMR\b|\bSAR\b|\bAED\b|\bQAR\b|\bDFM\b|\bADX\b|\bQSE\b/);
    }
  });

  it("the raw search the spec asks for finds only the exchange table and comments", () => {
    for (const f of files) {
      const text = readFileSync(path.join(dir, f), "utf8");
      if (f === "exchange-map.ts") continue;
      const hits = text.split("\n").filter((line) => /TADAWUL|MSX|OMR/.test(line));
      for (const line of hits) expect(line.trim().startsWith("//") || line.trim().startsWith("*"), `${f}: ${line}`).toBe(true);
    }
  });

  it("the lists come from the real enums", () => {
    expect(supportedCurrencies()).toContain("USD");
    expect(realMarketNames()).toContain("US");
  });
});

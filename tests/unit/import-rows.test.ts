import { afterEach, describe, expect, it, vi } from "vitest";
import {
  validateMappedRow,
  validateMappedRows,
  type KnownInstrument,
  type MappedImportRow,
} from "@/lib/import-rows";
import {
  FUTURE_TRADE_DATE_MESSAGE,
  isTradeDateInFuture,
  latestAllowedTradeDay,
  toTransactionRecord,
  transactionInputSchema,
} from "@/lib/transaction-schema";

const instruments: KnownInstrument[] = [
  { id: "id-aapl", ticker: "AAPL", market: "US", currency: "USD" },
  { id: "id-bkmb", ticker: "BKMB", market: "MSX", currency: "OMR" },
  // Same ticker on two markets, to exercise the ambiguity case:
  { id: "id-abc-us", ticker: "ABC", market: "US", currency: "USD" },
  { id: "id-abc-dfm", ticker: "ABC", market: "DFM", currency: "AED" },
];

describe("validateMappedRow — good rows", () => {
  it("accepts a BUY row and derives the amount from quantity × price", () => {
    const row: MappedImportRow = {
      ticker: "aapl",
      market: "us",
      type: "buy",
      quantity: "10",
      pricePerUnit: "210",
      fee: "5",
      currency: "USD",
      tradeDate: "2026-03-01",
      note: "first buy",
    };
    const result = validateMappedRow(row, 1, instruments);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.type).toBe("BUY");
    const record = toTransactionRecord(result.parsed);
    expect(record.instrumentId).toBe("id-aapl");
    expect(record.amount).toBe(2100); // derived server-side, NOT from the CSV
    expect(record.fee).toBe(5);
    expect(record.quantity).toBe(10);
  });

  it("ignores a client-supplied amount for BUY/SELL", () => {
    const row: MappedImportRow = {
      ticker: "AAPL",
      type: "SELL",
      quantity: "2",
      pricePerUnit: "100",
      amount: "999999", // must be ignored
      currency: "USD",
      tradeDate: "2026-03-01",
    };
    const result = validateMappedRow(row, 1, instruments);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(toTransactionRecord(result.parsed).amount).toBe(200);
  });

  it("accepts a DEPOSIT row without ticker or fee", () => {
    const row: MappedImportRow = {
      type: "DEPOSIT",
      amount: "1000",
      currency: "OMR",
      tradeDate: "2026-01-05",
    };
    const result = validateMappedRow(row, 1, instruments);
    expect(result.ok).toBe(true);
  });

  it("falls back to the instrument's currency when the currency cell is empty", () => {
    const row: MappedImportRow = {
      ticker: "BKMB",
      type: "DIVIDEND",
      amount: "135",
      tradeDate: "2026-03-25",
    };
    const result = validateMappedRow(row, 1, instruments);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.currency).toBe("OMR");
  });
});

describe("validateMappedRow — error cases", () => {
  const base: MappedImportRow = {
    ticker: "AAPL",
    type: "BUY",
    quantity: "10",
    pricePerUnit: "210",
    currency: "USD",
    tradeDate: "2026-03-01",
  };

  it("flags an unknown ticker in plain English", () => {
    const result = validateMappedRow({ ...base, ticker: "AAPPL" }, 3, instruments);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.row).toBe(3);
    expect(result.issues).toContain(
      "Unknown ticker 'AAPPL' — check spelling or track it first.",
    );
  });

  it("flags a ticker on the wrong market", () => {
    const result = validateMappedRow({ ...base, market: "MSX" }, 1, instruments);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatch(/not tracked on market 'MSX'/);
  });

  it("flags an ambiguous ticker when no market column is mapped", () => {
    const result = validateMappedRow({ ...base, ticker: "ABC" }, 1, instruments);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatch(/more than one market/);
  });

  it("flags a missing trade date", () => {
    const result = validateMappedRow({ ...base, tradeDate: "  " }, 1, instruments);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContain("Missing trade date.");
  });

  it("flags BUY without quantity and price", () => {
    const result = validateMappedRow(
      { ticker: "AAPL", type: "BUY", currency: "USD", tradeDate: "2026-03-01" },
      1,
      instruments,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContain("Type 'BUY' requires a Quantity and Price.");
  });

  it("flags an unrecognized type", () => {
    const result = validateMappedRow({ ...base, type: "TRANSFER" }, 1, instruments);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatch(/'TRANSFER' is not recognized/);
  });

  it("flags bad number, date and currency values", () => {
    const badNumber = validateMappedRow({ ...base, quantity: "ten" }, 1, instruments);
    expect(badNumber.ok).toBe(false);

    const badDate = validateMappedRow({ ...base, tradeDate: "not-a-date" }, 1, instruments);
    expect(badDate.ok).toBe(false);

    const badCurrency = validateMappedRow({ ...base, currency: "EUR" }, 1, instruments);
    expect(badCurrency.ok).toBe(false);
    if (badCurrency.ok) return;
    expect(badCurrency.issues[0]).toMatch(/OMR, USD, SAR, AED or QAR/);
  });

  it("flags a negative quantity", () => {
    const result = validateMappedRow({ ...base, quantity: "-5" }, 1, instruments);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContain("Quantity must be greater than zero.");
  });

  it("flags a ticker on a cash-only row", () => {
    const result = validateMappedRow(
      { ticker: "AAPL", type: "DEPOSIT", amount: "100", currency: "USD", tradeDate: "2026-01-01" },
      1,
      instruments,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatch(/cash entry/);
  });

  it("requires a ticker for instrument transactions", () => {
    const result = validateMappedRow(
      { type: "DIVIDEND", amount: "10", currency: "USD", tradeDate: "2026-01-01" },
      1,
      instruments,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContain("Type 'DIVIDEND' requires a Ticker.");
  });
});

describe("validateMappedRows", () => {
  it("summarizes valid and errored rows with 1-based row numbers", () => {
    const rows: MappedImportRow[] = [
      { type: "DEPOSIT", amount: "100", currency: "OMR", tradeDate: "2026-01-01" },
      { type: "BUY", ticker: "NOPE", quantity: "1", pricePerUnit: "1", currency: "USD", tradeDate: "2026-01-02" },
    ];
    const report = validateMappedRows(rows, instruments);
    expect(report.total).toBe(2);
    expect(report.validCount).toBe(1);
    expect(report.errorCount).toBe(1);
    expect(report.results[0]).toMatchObject({ row: 1, ok: true });
    expect(report.results[1]).toMatchObject({ row: 2, ok: false });
  });
});

// --- Future-dated trades: one shared rule, every door -----------------------
describe("trade dates in the future are refused", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const goodBuy: MappedImportRow = {
    ticker: "AAPL",
    market: "US",
    type: "BUY",
    quantity: "1",
    pricePerUnit: "10",
    currency: "USD",
  };

  it("refuses the year 2099 in the import with the exact sentence", () => {
    const result = validateMappedRow({ ...goodBuy, tradeDate: "2099-01-01" }, 1, instruments);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(["Trade date is in the future. Check the date."]);
    expect(FUTURE_TRADE_DATE_MESSAGE).toBe("Trade date is in the future. Check the date.");
  });

  it("accepts today, refuses tomorrow-everywhere, with a fixed clock", () => {
    // 1 Oct 2026, 12:00 UTC. At UTC+14 it is already 2 Oct 02:00.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));

    const today = validateMappedRow({ ...goodBuy, tradeDate: "2026-10-01" }, 1, instruments);
    expect(today.ok).toBe(true);

    // 2 Oct has already begun in UTC+14, so it is accepted...
    const oneAhead = validateMappedRow({ ...goodBuy, tradeDate: "2026-10-02" }, 1, instruments);
    expect(oneAhead.ok).toBe(true);

    // ...but 3 Oct has not begun anywhere yet.
    const twoAhead = validateMappedRow({ ...goodBuy, tradeDate: "2026-10-03" }, 1, instruments);
    expect(twoAhead.ok).toBe(false);
  });

  it("one day ahead is accepted only when that day has begun somewhere", () => {
    // 09:59 UTC: UTC+14 is 23:59 on the SAME day, so the next day has not begun anywhere.
    const before = new Date("2026-10-01T09:59:00Z");
    expect(isTradeDateInFuture(new Date("2026-10-02"), before)).toBe(true);
    expect(isTradeDateInFuture(new Date("2026-10-01"), before)).toBe(false);
    // 10:00 UTC: UTC+14 just turned midnight into 2 Oct.
    const after = new Date("2026-10-01T10:00:00Z");
    expect(isTradeDateInFuture(new Date("2026-10-02"), after)).toBe(false);
    expect(isTradeDateInFuture(new Date("2026-10-03"), after)).toBe(true);
    expect(latestAllowedTradeDay(after).toISOString()).toBe("2026-10-02T00:00:00.000Z");
  });

  it("the Add Transaction / edit path refuses the same date through the same schema", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    const input = {
      type: "DEPOSIT",
      amount: 100,
      currency: "OMR",
    };
    const future = transactionInputSchema.safeParse({ ...input, tradeDate: new Date("2099-01-01") });
    expect(future.success).toBe(false);
    if (!future.success) {
      expect(future.error.issues.map((i) => i.message)).toEqual([FUTURE_TRADE_DATE_MESSAGE]);
    }
    // A plain string (what a form or API might send) is refused too.
    expect(transactionInputSchema.safeParse({ ...input, tradeDate: "2099-01-01" }).success).toBe(false);
    // Today is fine.
    expect(transactionInputSchema.safeParse({ ...input, tradeDate: new Date("2026-10-01") }).success).toBe(true);
  });
});

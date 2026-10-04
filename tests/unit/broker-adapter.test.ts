import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adaptFlexReport, parseFlexReport, MAX_REPORT_TRADES, statementTradesForTest } from "./broker-adapter-helpers";
import { prepareUpload, readBrokerFile } from "@/lib/import-presets";
import {
  STATEMENT_EMPTY,
  STATEMENT_MISSING_ATTRIBUTE,
  STATEMENT_SUMMARY_ONLY,
  STATEMENT_TRADES,
  STATEMENT_TWO_ACCOUNTS,
  STATEMENT_UNKNOWN_LAYOUT,
  STATEMENT_WITH_DOCTYPE,
  STATEMENT_WITH_SUMMARY_LINE,
  statementWith,
} from "../fixtures/ibkr-flex";

const instruments = [
  { ticker: "AAPL", market: "US" },
  { ticker: "MSFT", market: "US" },
];

describe("Flex XML adapter through the real Step 4a IBKR preset", () => {
  it("yields exactly 3 ready, 2 skipped, 0 errors", () => {
    const adapted = adaptFlexReport(STATEMENT_TRADES);
    expect(adapted.ok).toBe(true);
    if (!adapted.ok || !adapted.read) throw new Error("setup");
    expect(adapted.read.ready).toHaveLength(3);
    expect(adapted.read.skipped).toHaveLength(2);
    expect(adapted.read.cannotRead).toHaveLength(0);
    expect(adapted.read.layout).toBe("flex");
    expect(adapted.tradeCount).toBe(5);
    const reasons = adapted.read.skipped.map((s) => s.code).sort();
    expect(reasons).toEqual(["currency", "option"]);
  });

  it("gives each row exactly the reference the CSV file path gives (core guarantee)", () => {
    const adapted = adaptFlexReport(STATEMENT_TRADES);
    const csv = readFileSync(path.resolve(__dirname, "../fixtures/brokers/ibkr-flex.csv"), "utf8");
    const fromFile = readBrokerFile("ibkr", csv);
    if (!adapted.ok || !adapted.read || !fromFile.ok) throw new Error("setup");
    const sync = adapted.read.ready.map((r) => r.reference).sort();
    const file = fromFile.ready.map((r) => r.reference).sort();
    expect(sync).toEqual(file);
    expect(sync).toEqual(["ibkr:900000001", "ibkr:900000002", "ibkr:900000003"]);
    // And the values match too (a sell's negative quantity becomes positive).
    const byRef = (rows: typeof fromFile.ready) =>
      Object.fromEntries(rows.map((r) => [r.reference, { ...r.mapped }]));
    expect(byRef(adapted.read.ready)).toEqual(byRef(fromFile.ready));
  });

  it("de-duplicates in both orders: file then sync, and sync then file", () => {
    const adapted = adaptFlexReport(STATEMENT_TRADES);
    const csv = readBrokerFile("ibkr", readFileSync(path.resolve(__dirname, "../fixtures/brokers/ibkr-flex.csv"), "utf8"));
    if (!adapted.ok || !adapted.read || !csv.ok) throw new Error("setup");

    // File imported first: its references are known when the sync runs.
    const afterFile = prepareUpload([adapted.read], {
      instruments,
      knownReferences: csv.ready.map((r) => r.reference),
    });
    expect(afterFile.serverRows).toHaveLength(0);
    expect(afterFile.alreadyImported).toHaveLength(3);

    // Sync first: the file then shows everything as already imported.
    const afterSync = prepareUpload([csv], {
      instruments,
      knownReferences: adapted.read.ready.map((r) => r.reference),
    });
    expect(afterSync.serverRows).toHaveLength(0);
    expect(afterSync.alreadyImported).toHaveLength(3);
  });

  it("syncing the same statement twice adds nothing the second time", () => {
    const adapted = adaptFlexReport(STATEMENT_TRADES);
    if (!adapted.ok || !adapted.read) throw new Error("setup");
    const first = prepareUpload([adapted.read], { instruments, knownReferences: [] });
    expect(first.serverRows).toHaveLength(3);
    const second = prepareUpload([adapted.read], {
      instruments,
      knownReferences: first.serverRows.map((r) => r.reference),
    });
    expect(second.serverRows).toHaveLength(0);
    expect(second.alreadyImported).toHaveLength(3);
  });

  it("summary-level lines are ignored and counted", () => {
    const adapted = adaptFlexReport(STATEMENT_WITH_SUMMARY_LINE);
    if (!adapted.ok || !adapted.read) throw new Error("setup");
    expect(adapted.read.ready).toHaveLength(1);
    expect(adapted.ignoredSummaryLines).toBe(1);
  });

  it("a query with only summary lines gets the 'tick Executions only' message", () => {
    const adapted = adaptFlexReport(STATEMENT_SUMMARY_ONLY);
    expect(adapted.ok).toBe(false);
    if (!adapted.ok) expect(adapted.message).toContain("tick Executions only");
  });

  it("an empty statement is a calm success with no rows", () => {
    const adapted = adaptFlexReport(STATEMENT_EMPTY);
    expect(adapted.ok).toBe(true);
    if (adapted.ok) {
      expect(adapted.read).toBeNull();
      expect(adapted.tradeCount).toBe(0);
    }
  });

  it("two accounts are all read, and counted", () => {
    const adapted = adaptFlexReport(STATEMENT_TWO_ACCOUNTS);
    if (!adapted.ok || !adapted.read) throw new Error("setup");
    expect(adapted.accountIds).toEqual(["U0000000", "U1111111"]);
    expect(adapted.read.ready).toHaveLength(2);
  });

  it("a missing attribute refuses the whole report and names it", () => {
    const adapted = adaptFlexReport(STATEMENT_MISSING_ATTRIBUTE);
    expect(adapted.ok).toBe(false);
    if (!adapted.ok) expect(adapted.message).toContain("tradePrice");
  });

  it("an unrecognised layout is refused, not read loosely", () => {
    const adapted = adaptFlexReport(STATEMENT_UNKNOWN_LAYOUT);
    expect(adapted.ok).toBe(false);
    if (!adapted.ok) expect(adapted.message).toContain("layout we don't recognise");
  });

  it("refuses a DOCTYPE/ENTITY and non-Flex text", () => {
    expect(adaptFlexReport(STATEMENT_WITH_DOCTYPE).ok).toBe(false);
    expect(adaptFlexReport("<html>nope</html>").ok).toBe(false);
    expect(adaptFlexReport("").ok).toBe(false);
  });

  it("more than 5,000 trades fails with nothing added", () => {
    const one = statementTradesForTest();
    const many = statementWith(Array.from({ length: MAX_REPORT_TRADES + 1 }, () => one));
    const adapted = adaptFlexReport(many);
    expect(adapted.ok).toBe(false);
    if (!adapted.ok) expect(adapted.message).toContain("more than 5,000 trades");
  });

  it("the guide's field list stays in step with the columns the adapter reads", async () => {
    const { FLEX_QUERY_FIELDS } = await import("@/lib/broker/ibkr-flex/fields");
    const { FLEX_COLUMNS } = await import("@/lib/broker/ibkr-flex/adapter");
    // The adapter's columns plus Account ID and Level Of Detail.
    expect(FLEX_QUERY_FIELDS.length).toBe(FLEX_COLUMNS.length + 2);
  });

  it("does not crash on non-Latin text in a field", () => {
    const arabic = statementWith([
      '<Trade accountId="U0000000" currency="USD" assetCategory="STK" symbol="AAPL" description="شركة أبل &amp; co" tradeDate="20260112" buySell="BUY" quantity="10" tradePrice="205.40" ibCommission="-1.00" ibCommissionCurrency="USD" transactionID="900000001" />',
    ]);
    const adapted = adaptFlexReport(arabic);
    expect(adapted.ok).toBe(true);
    expect(parseFlexReport(arabic).ok).toBe(true);
  });
});

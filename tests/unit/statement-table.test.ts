import { describe, expect, it } from "vitest";
import { buildStatementTable } from "@/lib/stocks/statement-table";

describe("buildStatementTable", () => {
  it("uses curated labels for known income-statement fields, in their curated order", () => {
    const table = buildStatementTable("income", [
      {
        date: "2025-12-31",
        calendarYear: "2025",
        netIncome: 100,
        revenue: 500,
        costOfRevenue: 200,
        grossProfit: 300,
        operatingIncome: 150,
      },
    ]);
    expect(table.rows.map((r) => r.label)).toEqual([
      "Revenue",
      "Cost of Revenue",
      "Gross Profit",
      "Operating Income",
      "Net Income",
    ]);
  });

  it("falls back to a rough title-cased label for unknown fields", () => {
    const table = buildStatementTable("income", [
      { date: "2025-12-31", ebitdaratio: 0.43 },
    ]);
    expect(table.rows).toEqual([{ key: "ebitdaratio", label: "Ebitdaratio", values: [0.43] }]);
  });

  it("excludes meta fields (date, symbol, reportedCurrency, …) from the line items", () => {
    const table = buildStatementTable("balance", [
      {
        date: "2025-12-31",
        symbol: "AAPL",
        reportedCurrency: "USD",
        cik: "abc",
        fillingDate: "2026-01-01",
        acceptedDate: "2026-01-01",
        calendarYear: "2025",
        period: "FY",
        link: "https://example.com",
        finalLink: "https://example.com",
        totalAssets: 900,
      },
    ]);
    expect(table.rows).toEqual([{ key: "totalAssets", label: "Total Assets", values: [900] }]);
  });

  it("surfaces reportedCurrency separately from the line items", () => {
    const table = buildStatementTable("balance", [
      { date: "2025-12-31", reportedCurrency: "USD", totalAssets: 900 },
    ]);
    expect(table.reportedCurrency).toBe("USD");
  });

  it("caps at 5 periods, most recent first", () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      date: `${2019 + i}-12-31`,
      revenue: i,
    }));
    const table = buildStatementTable("income", rows);
    expect(table.periods).toEqual(["FY2025", "FY2024", "FY2023", "FY2022", "FY2021"]);
    expect(table.rows[0].values).toEqual([6, 5, 4, 3, 2]);
  });

  it("prefers the calendarYear field for the period label when present", () => {
    const table = buildStatementTable("income", [
      { date: "2025-06-15", calendarYear: "2025", revenue: 1 },
    ]);
    expect(table.periods).toEqual(["FY2025"]);
  });

  it("uses null for a field present in one period but not another", () => {
    const table = buildStatementTable("cash-flow", [
      { date: "2025-12-31", operatingCashFlow: 50, freeCashFlow: 40 },
    ]);
    expect(table.rows.map((r) => r.key)).toEqual(["operatingCashFlow", "freeCashFlow"]);
  });

  it("returns empty periods and rows for no statement data", () => {
    const table = buildStatementTable("income", []);
    expect(table.periods).toEqual([]);
    expect(table.rows).toEqual([]);
    expect(table.reportedCurrency).toBeNull();
  });
});

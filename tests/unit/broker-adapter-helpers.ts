// Small helpers for the adapter tests (not a test file itself).
export { adaptFlexReport, parseFlexReport, MAX_REPORT_TRADES } from "@/lib/broker/ibkr-flex/adapter";

/** One valid Trade element, for building large reports. */
export function statementTradesForTest(): string {
  return '<Trade accountId="U0000000" currency="USD" assetCategory="STK" symbol="AAPL" tradeDate="20260112" buySell="BUY" quantity="1" tradePrice="1" transactionID="1" />';
}

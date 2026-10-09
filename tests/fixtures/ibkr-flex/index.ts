// IBKR Flex fixtures. Hand-written in IBKR's documented shape with made-up ids
// (account U0000000, ids 900000001...). Shaped from IBKR's documented format,
// NOT recorded from a live account: no agent has an IBKR account. If the owner
// ever supplies one anonymised paper-account reply, check these and the
// adapter against it.
//
// The statement mirrors tests/fixtures/brokers/ibkr-flex.csv: 3 ready rows
// (AAPL buy, MSFT buy, AAPL sell), 1 EUR row and 1 option row (both skipped).

export function sendSuccess(referenceCode = "1234567890"): string {
  return `<FlexStatementResponse timestamp='30 September, 2026 10:00 AM EDT'>
<Status>Success</Status>
<ReferenceCode>${referenceCode}</ReferenceCode>
<Url>https://example.invalid/ignored</Url>
</FlexStatementResponse>`;
}

export function flexFail(code: number, message = "Something."): string {
  return `<FlexStatementResponse timestamp='30 September, 2026 10:00 AM EDT'>
<Status>Fail</Status>
<ErrorCode>${code}</ErrorCode>
<ErrorMessage>${message}</ErrorMessage>
</FlexStatementResponse>`;
}

const TRADE_AAPL_BUY =
  '<Trade accountId="U0000000" currency="USD" assetCategory="STK" symbol="AAPL" isin="US0378331005" tradeDate="20260112" buySell="BUY" quantity="10" tradePrice="205.40" ibCommission="-1.00" ibCommissionCurrency="USD" transactionID="900000001" levelOfDetail="EXECUTION" />';
const TRADE_MSFT_BUY =
  '<Trade accountId="U0000000" currency="USD" assetCategory="STK" symbol="MSFT" isin="US5949181045" tradeDate="20260203" buySell="BUY" quantity="5" tradePrice="410.10" ibCommission="-1.00" ibCommissionCurrency="USD" transactionID="900000002" levelOfDetail="EXECUTION" />';
const TRADE_AAPL_SELL =
  '<Trade accountId="U0000000" currency="USD" assetCategory="STK" symbol="AAPL" isin="US0378331005" tradeDate="20260302" buySell="SELL" quantity="-4" tradePrice="214.00" ibCommission="-1.00" ibCommissionCurrency="USD" transactionID="900000003" levelOfDetail="EXECUTION" />';
const TRADE_SAP_EUR =
  '<Trade accountId="U0000000" currency="EUR" assetCategory="STK" symbol="SAP" isin="DE0007164600" tradeDate="20260310" buySell="BUY" quantity="3" tradePrice="150.00" ibCommission="-1.50" ibCommissionCurrency="EUR" transactionID="900000004" levelOfDetail="EXECUTION" />';
const TRADE_OPTION =
  '<Trade accountId="U0000000" currency="USD" assetCategory="OPT" symbol="AAPL 260619C00220000" isin="" tradeDate="20260401" buySell="BUY" quantity="1" tradePrice="3.20" ibCommission="-0.65" ibCommissionCurrency="USD" transactionID="900000005" levelOfDetail="EXECUTION" />';

export function statementWith(tradesXml: string[], accountId = "U0000000"): string {
  return `<FlexQueryResponse queryName="InvestIQ trades" type="AF">
<FlexStatements count="1">
<FlexStatement accountId="${accountId}" fromDate="20260101" toDate="20260630" period="LastYear" whenGenerated="20260701;120000">
<Trades>
${tradesXml.join("\n")}
</Trades>
</FlexStatement>
</FlexStatements>
</FlexQueryResponse>`;
}

/** 3 ready, 2 skipped (a EUR row and an option). */
export const STATEMENT_TRADES = statementWith([
  TRADE_AAPL_BUY,
  TRADE_MSFT_BUY,
  TRADE_AAPL_SELL,
  TRADE_SAP_EUR,
  TRADE_OPTION,
]);

/** Only the AAPL sell: a sell with no buy in range. */
export const STATEMENT_SELL_ONLY = statementWith([TRADE_AAPL_SELL]);

export const STATEMENT_EMPTY = statementWith([]);

/** Summary-level lines only (no EXECUTION rows). */
export const STATEMENT_SUMMARY_ONLY = statementWith([
  TRADE_AAPL_BUY.replace('levelOfDetail="EXECUTION"', 'levelOfDetail="SUMMARY"'),
]);

/** Executions plus a summary line that must not be counted twice. */
export const STATEMENT_WITH_SUMMARY_LINE = statementWith([
  TRADE_AAPL_BUY,
  TRADE_MSFT_BUY.replace('levelOfDetail="EXECUTION"', 'levelOfDetail="CLOSED_LOT"'),
]);

export const STATEMENT_TWO_ACCOUNTS = statementWith([
  TRADE_AAPL_BUY,
  TRADE_MSFT_BUY.replace('accountId="U0000000"', 'accountId="U1111111"'),
]);

/** A Trade missing the tradePrice attribute. */
export const STATEMENT_MISSING_ATTRIBUTE = statementWith([
  TRADE_AAPL_BUY.replace(' tradePrice="205.40"', ""),
]);

/** A report with no Trades section at all (a different kind of query). */
export const STATEMENT_UNKNOWN_LAYOUT = `<FlexQueryResponse queryName="x" type="AF"><FlexStatements count="1"><FlexStatement accountId="U0000000"><OpenPositions /></FlexStatement></FlexStatements></FlexQueryResponse>`;

export const STATEMENT_WITH_DOCTYPE = `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY x "boom">]>${STATEMENT_TRADES}`;

export const HTML_ERROR_PAGE = "<html><body><h1>502 Bad Gateway</h1></body></html>";

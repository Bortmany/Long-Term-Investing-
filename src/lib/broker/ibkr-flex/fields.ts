// The Flex query fields the user must tick, shown in the connect guide. They
// are the fields the adapter (adapter.ts, FLEX_COLUMNS) reads, in IBKR's own
// wording (plus Account ID and Level Of Detail, which the adapter reads
// directly). A unit test checks the two lists stay in step, so adding a
// column in one place without the other fails the tests.

export const FLEX_QUERY_FIELDS = [
  "Account ID",
  "Currency",
  "Asset Class",
  "Symbol",
  "Listing Exchange",
  "Trade Date",
  "Buy/Sell",
  "Quantity",
  "Trade Price",
  "IB Commission",
  "IB Commission Currency",
  "Transaction ID",
  "Level Of Detail",
] as const;

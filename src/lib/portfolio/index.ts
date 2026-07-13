// Public API of the portfolio math library (pure functions, no I/O).
// Builder 2: read docs/CONVENTIONS.md — every displayed figure needs its
// source badge, and incomplete results (missing price / FX rate) must be
// shown as such, never padded with fake numbers.

export {
  convertAmount,
  findRate,
  type ConversionMissing,
  type ConversionOk,
  type ConversionResult,
} from "./fx";
export {
  computeCashBalances,
  computeHoldings,
  type CashBalance,
  type Holding,
} from "./holdings";
export {
  computePortfolioValue,
  type HoldingValuation,
  type MissingValuation,
  type PortfolioValue,
  type ValuedCash,
  type ValuedHolding,
} from "./value";
export {
  computeDividendsByHolding,
  computeMonthlyDividends,
  computeTrailingDividendIncome,
  type DividendIncome,
  type DividendsByHolding,
  type MonthlyDividendBucket,
  type MonthlyDividends,
} from "./dividends";
export {
  computeReturns,
  type PortfolioReturns,
  type ReturnFigure,
} from "./returns";
export {
  computeAllocation,
  UNKNOWN_BUCKET,
  type AllocatableHolding,
  type Allocation,
  type AllocationKey,
  type AllocationSlice,
} from "./allocation";
export {
  fromPrismaFxRate,
  fromPrismaPriceCache,
  fromPrismaTransaction,
  type FxRateInput,
  type PriceInput,
  type TxnInput,
  type ValueSource,
} from "./types";

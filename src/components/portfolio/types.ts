// Serializable data shapes the /portfolio server page hands to its client
// components. Everything here is plain data (numbers, strings, Dates) — the
// Prisma Decimals were already converted at the edge by the server page.

import type { Currency, Market, TransactionType } from "@prisma/client";
import type { ValueSource } from "@/lib/portfolio";

/** One row of the Holdings table, fully valued (or honestly not) server-side. */
export type HoldingRowData = {
  instrumentId: string;
  ticker: string;
  name: string;
  quantity: number;
  /** The currency the position was traded in (avg cost is in this currency). */
  currency: Currency;
  /** Average cost per unit, net of buy fees; null only for a zero position. */
  avgCost: number | null;
  /** Latest known price for the instrument, in its own currency. */
  price:
    | { ok: true; value: number; currency: Currency; source: ValueSource }
    | { ok: false };
  /** Market value in the portfolio base currency. */
  valuation:
    | { ok: true; marketValue: number; source: ValueSource }
    | { ok: false; reason: "missing_price" | "missing_fx_rate" };
  /** Unrealized gain/loss in the base currency (+ percent of cost basis). */
  gainLoss:
    | { ok: true; amount: number; pct: number | null }
    | { ok: false; reason: "missing_price" | "missing_fx_rate" };
  /** Share of total portfolio value; null when the row couldn't be valued. */
  weightPct: number | null;
  /** True when this instrument routes to the manual price provider
      (non-US market, or US without FMP_API_KEY) — decided server-side. */
  manualPricing: boolean;
};

/** One row of the Transactions table. */
export type TransactionRowData = {
  id: string;
  type: TransactionType;
  instrumentId: string | null;
  ticker: string | null;
  quantity: number | null;
  pricePerUnit: number | null;
  amount: number;
  currency: Currency;
  fee: number;
  tradeDate: Date;
  note: string | null;
};

/** An instrument option for the pickers in the Add Transaction dialog. */
export type InstrumentOptionData = {
  id: string;
  ticker: string;
  name: string;
  currency: Currency;
  market: Market;
};

/** Plain-English label for a transaction type (Buy, Sell, …). */
export function transactionTypeLabel(type: TransactionType): string {
  switch (type) {
    case "BUY":
      return "Buy";
    case "SELL":
      return "Sell";
    case "DIVIDEND":
      return "Dividend";
    case "DEPOSIT":
      return "Deposit";
    case "WITHDRAWAL":
      return "Withdrawal";
    case "FEE":
      return "Fee";
  }
}

/** Whether a transaction's amount is cash coming in (+) or going out (−). */
export function isCashInflow(type: TransactionType): boolean {
  return type === "SELL" || type === "DIVIDEND" || type === "DEPOSIT";
}

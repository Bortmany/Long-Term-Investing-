// Zod v4 schemas for transaction input — one branch per transaction type.
//
// GOLDEN RULE support: for BUY and SELL the client NEVER supplies `amount`.
// The server derives it from quantity × price (the fee is stored in its own
// column and applied exactly once by the portfolio math: cost basis adds it,
// cash subtracts it — so a BUY costs qty × price + fee in total and a SELL
// nets qty × price − fee, without ever double-counting the fee).

import { Currency } from "@prisma/client";
import { z } from "zod";
import { currencyListSentence } from "@/lib/markets";

// Shared field pieces -------------------------------------------------------

// Upper bound for money/quantity fields. The database columns are
// Decimal(20, 8) — 12 digits before the point — so a value at/over 10^12
// throws an unhandled Postgres numeric-overflow (22003 → a 500). Capping the
// input at 100 billion (comfortably under that limit, and far larger than any
// real trade) turns "1e30" into a clean, plain-English 400 instead.
export const MONEY_MAX = 100_000_000_000; // 1e11

const currencySchema = z.enum(Currency, {
  error: currencyListSentence(),
});

// The "not in the future" rule ---------------------------------------------
//
// A trade date is refused only if that calendar day has not yet begun ANYWHERE
// on Earth. The furthest-ahead clock is UTC+14, so the latest day we accept is
// "today" as seen at UTC+14. This way someone in Oman typing today's date just
// after midnight (or someone in Auckland) is never wrongly refused, but a date
// like 2099 always is. This one rule lives here, in the shared schema, so the
// Add Transaction form, editing, and the CSV import (both its dry run and its
// final save) all use it and none can bypass it.

export const FUTURE_TRADE_DATE_MESSAGE =
  "Trade date is in the future. Check the date.";

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const EARTH_LEADING_OFFSET_HOURS = 14; // UTC+14 is the first place each new day starts

/** Midnight (UTC) that starts the calendar day a given moment falls in. */
function startOfUtcDay(ms: number): number {
  return Math.floor(ms / MS_PER_DAY) * MS_PER_DAY;
}

/**
 * The latest trade day we accept, as midnight UTC of that calendar day:
 * today's date at UTC+14. `now` can be passed in so tests use a fixed clock.
 */
export function latestAllowedTradeDay(now: Date = new Date()): Date {
  return new Date(
    startOfUtcDay(now.getTime() + EARTH_LEADING_OFFSET_HOURS * MS_PER_HOUR),
  );
}

/** True when the trade date's calendar day has not begun anywhere on Earth yet. */
export function isTradeDateInFuture(
  tradeDate: Date,
  now: Date = new Date(),
): boolean {
  const time = tradeDate.getTime();
  if (Number.isNaN(time)) return false; // an unreadable date gets its own message
  return startOfUtcDay(time) > latestAllowedTradeDay(now).getTime();
}

const tradeDateSchema = z.coerce
  .date({ error: "Enter a valid trade date." })
  .refine((d) => !Number.isNaN(d.getTime()), "Enter a valid trade date.")
  // `new Date()` is read each time the rule runs, so tests can fix the clock
  // (vi.setSystemTime) or call isTradeDateInFuture directly with their own `now`.
  .refine((d) => !isTradeDateInFuture(d), FUTURE_TRADE_DATE_MESSAGE);

const noteSchema = z
  .string()
  .trim()
  .max(500, "Notes are limited to 500 characters.")
  .optional();

const instrumentIdSchema = z
  .string({ error: "Pick an instrument." })
  .trim()
  .min(1, "Pick an instrument.");

const quantitySchema = z.coerce
  .number({ error: "Enter a quantity as a number." })
  .positive("Quantity must be greater than zero.")
  .max(MONEY_MAX, "That quantity is too large — check the number.");

const priceSchema = z.coerce
  .number({ error: "Enter a price as a number." })
  .positive("Price per unit must be greater than zero.")
  .max(MONEY_MAX, "That price is too large — check the number.");

const amountSchema = z.coerce
  .number({ error: "Enter an amount as a number." })
  .positive("Amount must be greater than zero.")
  .max(MONEY_MAX, "That amount is too large — check the number.");

const feeSchema = z.coerce
  .number({ error: "Enter the fee as a number." })
  .nonnegative("Fee cannot be negative.")
  .max(MONEY_MAX, "That fee is too large — check the number.")
  .default(0);

const common = {
  tradeDate: tradeDateSchema,
  note: noteSchema,
  currency: currencySchema,
};

// One schema per transaction type -------------------------------------------

/** BUY / SELL: instrument + quantity + price. Amount is server-computed. */
export const buyTransactionSchema = z.object({
  type: z.literal("BUY"),
  instrumentId: instrumentIdSchema,
  quantity: quantitySchema,
  pricePerUnit: priceSchema,
  fee: feeSchema,
  ...common,
});

export const sellTransactionSchema = z.object({
  type: z.literal("SELL"),
  instrumentId: instrumentIdSchema,
  quantity: quantitySchema,
  pricePerUnit: priceSchema,
  fee: feeSchema,
  ...common,
});

/** DIVIDEND: instrument + total amount received; fee = withholding, if any. */
export const dividendTransactionSchema = z.object({
  type: z.literal("DIVIDEND"),
  instrumentId: instrumentIdSchema,
  amount: amountSchema,
  fee: feeSchema,
  ...common,
});

/** DEPOSIT / WITHDRAWAL: cash only — no instrument, no fee. */
export const depositTransactionSchema = z.object({
  type: z.literal("DEPOSIT"),
  amount: amountSchema,
  ...common,
});

export const withdrawalTransactionSchema = z.object({
  type: z.literal("WITHDRAWAL"),
  amount: amountSchema,
  ...common,
});

/** FEE: an account-level fee, optionally tied to one instrument. */
export const feeTransactionSchema = z.object({
  type: z.literal("FEE"),
  instrumentId: instrumentIdSchema.optional(),
  amount: amountSchema,
  ...common,
});

/** Every valid transaction input, discriminated on `type`. */
export const transactionInputSchema = z.discriminatedUnion("type", [
  buyTransactionSchema,
  sellTransactionSchema,
  dividendTransactionSchema,
  depositTransactionSchema,
  withdrawalTransactionSchema,
  feeTransactionSchema,
]);

// Inferred TypeScript types --------------------------------------------------

export type BuyTransactionInput = z.infer<typeof buyTransactionSchema>;
export type SellTransactionInput = z.infer<typeof sellTransactionSchema>;
export type DividendTransactionInput = z.infer<typeof dividendTransactionSchema>;
export type DepositTransactionInput = z.infer<typeof depositTransactionSchema>;
export type WithdrawalTransactionInput = z.infer<typeof withdrawalTransactionSchema>;
export type FeeTransactionInput = z.infer<typeof feeTransactionSchema>;
export type TransactionInput = z.infer<typeof transactionInputSchema>;

// Server-side amount derivation ----------------------------------------------

/**
 * The `amount` column value for a validated input. BUY/SELL amounts are
 * always derived here (quantity × price) — never taken from the client.
 * The fee lives in its own column; the portfolio math applies it exactly
 * once (BUY total cash out = amount + fee; SELL net cash in = amount − fee).
 */
export function deriveTransactionAmount(input: TransactionInput): number {
  if (input.type === "BUY" || input.type === "SELL") {
    return input.quantity * input.pricePerUnit;
  }
  return input.amount;
}

/** The values to persist, with BUY/SELL amounts derived server-side. */
export function toTransactionRecord(input: TransactionInput): {
  type: TransactionInput["type"];
  instrumentId: string | null;
  quantity: number | null;
  pricePerUnit: number | null;
  amount: number;
  currency: Currency;
  fee: number;
  tradeDate: Date;
  note: string | null;
} {
  const isTrade = input.type === "BUY" || input.type === "SELL";
  return {
    type: input.type,
    instrumentId:
      "instrumentId" in input && input.instrumentId ? input.instrumentId : null,
    quantity: isTrade ? input.quantity : null,
    pricePerUnit: isTrade ? input.pricePerUnit : null,
    amount: deriveTransactionAmount(input),
    currency: input.currency,
    fee: "fee" in input ? input.fee : 0,
    tradeDate: input.tradeDate,
    note: input.note && input.note.length > 0 ? input.note : null,
  };
}

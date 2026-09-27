// Zod v4 schemas for alert input — one branch per alert kind (BUILD-PLAN.md
// Phase 7), discriminated on `kind`. Same shape/style as
// src/lib/transaction-schema.ts.

import { z } from "zod";

const instrumentIdSchema = z
  .string({ error: "Pick a stock." })
  .trim()
  .min(1, "Pick a stock.");

const thesisIdSchema = z
  .string({ error: "Pick a thesis." })
  .trim()
  .min(1, "Pick a thesis.");

/** PRICE_ABOVE / PRICE_BELOW: a price in the instrument's own currency. */
// Upper bound matches the transaction schema's MONEY_MAX: the threshold is
// stored in a Decimal(20, 8) column, so an absurd value (e.g. 1e30) would
// otherwise overflow Postgres (22003 → 500). Cap it for a clean 400 instead.
const priceThresholdSchema = z.coerce
  .number({ error: "Enter a price as a number." })
  .positive("Enter a price greater than zero.")
  .max(100_000_000_000, "That price is too large — check the number.");

/** DAY_DROP: a positive percentage drop within a single day. */
const dayDropThresholdSchema = z.coerce
  .number({ error: "Enter a percentage as a number." })
  .min(0.1, "Enter a drop of at least 0.1%.")
  .max(100, "Enter a drop of at most 100%.");

const intervalDaysSchema = z.coerce
  .number({ error: "Enter the number of days as a whole number." })
  .int("Enter a whole number of days.")
  .min(1, "Review at least every 1 day.")
  .max(365, "Review at most every 365 days.");

export const priceAboveAlertSchema = z.object({
  kind: z.literal("PRICE_ABOVE"),
  instrumentId: instrumentIdSchema,
  threshold: priceThresholdSchema,
});

export const priceBelowAlertSchema = z.object({
  kind: z.literal("PRICE_BELOW"),
  instrumentId: instrumentIdSchema,
  threshold: priceThresholdSchema,
});

export const dayDropAlertSchema = z.object({
  kind: z.literal("DAY_DROP"),
  instrumentId: instrumentIdSchema,
  threshold: dayDropThresholdSchema,
});

export const thesisReviewDueAlertSchema = z.object({
  kind: z.literal("THESIS_REVIEW_DUE"),
  thesisId: thesisIdSchema,
  intervalDays: intervalDaysSchema,
});

/** Every valid alert input, discriminated on `kind`. */
export const alertInputSchema = z.discriminatedUnion("kind", [
  priceAboveAlertSchema,
  priceBelowAlertSchema,
  dayDropAlertSchema,
  thesisReviewDueAlertSchema,
]);

export type PriceAboveAlertInput = z.infer<typeof priceAboveAlertSchema>;
export type PriceBelowAlertInput = z.infer<typeof priceBelowAlertSchema>;
export type DayDropAlertInput = z.infer<typeof dayDropAlertSchema>;
export type ThesisReviewDueAlertInput = z.infer<typeof thesisReviewDueAlertSchema>;
export type AlertInput = z.infer<typeof alertInputSchema>;

/** Plain-English label for an alert kind, used by the New/Edit Alert dialog's kind Select. */
export function alertKindLabel(kind: AlertInput["kind"]): string {
  switch (kind) {
    case "PRICE_ABOVE":
      return "Price rises above";
    case "PRICE_BELOW":
      return "Price falls below";
    case "DAY_DROP":
      return "Drops in one day by";
    case "THESIS_REVIEW_DUE":
      return "Thesis review reminder";
  }
}

"use server";

// Manually record a price for an instrument (the pricing path for MSX /
// TADAWUL / DFM / OTHER instruments, and for US ones without an FMP key).
//
// SECURITY (docs/CONVENTIONS.md, golden rule): a hand-entered price is stored
// in the USER-SCOPED ManualPrice table, NOT the shared PriceCache. The shared
// cache is written only by the server's FMP refresh / seed paths; if a user
// could write to it, one person's price would corrupt every user's valuation
// (newest asOf wins). Each user's valuation reads only their own ManualPrice
// rows, which still show the honest "manual, as of {date}" badge — for that
// user alone.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getSessionUserId } from "@/lib/user-portfolio";
import { MONEY_MAX } from "@/lib/transaction-schema";
import {
  rateLimit,
  rateLimitMessage,
  userKey,
  WRITE_ACTION_RATE_LIMIT,
} from "@/lib/rate-limit";

const updateManualPriceSchema = z.object({
  instrumentId: z
    .string({ error: "Pick an instrument." })
    .trim()
    .min(1, "Pick an instrument."),
  price: z.coerce
    .number({ error: "Enter the price as a number." })
    .positive("Price must be greater than zero.")
    // Upper bound so an absurd number (e.g. 1e30) is a clean 400, never an
    // unhandled Postgres numeric-overflow 500.
    .max(MONEY_MAX, "That price is too large — check the number."),
  asOf: z.coerce
    .date({ error: "Enter a valid as-of date." })
    // A price can't be "as of" a day that hasn't happened yet.
    .refine((d) => d.getTime() <= Date.now(), {
      message: "The as-of date can't be in the future.",
    }),
});

export type UpdateManualPriceInput = z.input<typeof updateManualPriceSchema>;

/**
 * Save a manually entered price into the signed-in user's OWN override table.
 * Stored in the instrument's own currency; only this user ever sees it.
 */
export async function updateManualPrice(
  input: UpdateManualPriceInput,
): Promise<ActionResult<{ id: string; asOf: Date }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(
    userKey("price-write", userId),
    WRITE_ACTION_RATE_LIMIT,
  );
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsed = updateManualPriceSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Please check the price details.",
    );
  }

  const instrument = await prisma.instrument.findUnique({
    where: { id: parsed.data.instrumentId },
  });
  if (!instrument) {
    return actionError("That instrument could not be found.");
  }

  const created = await prisma.manualPrice.create({
    data: {
      userId,
      instrumentId: instrument.id,
      price: parsed.data.price,
      currency: instrument.currency,
      asOf: parsed.data.asOf,
    },
  });

  revalidatePath("/portfolio");
  revalidatePath("/dashboard");
  return actionOk({ id: created.id, asOf: created.asOf });
}

"use server";

// Manually record a price for an instrument (the pricing path for MSX /
// TADAWUL / DFM / OTHER instruments, and for US ones without an FMP key).
// Writes a new PriceCache row with source MANUAL so the UI shows the honest
// "manual, as of {date}" badge — golden rule.

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

const updateManualPriceSchema = z.object({
  instrumentId: z
    .string({ error: "Pick an instrument." })
    .trim()
    .min(1, "Pick an instrument."),
  price: z.coerce
    .number({ error: "Enter the price as a number." })
    .positive("Price must be greater than zero."),
  asOf: z.coerce.date({ error: "Enter a valid as-of date." }),
});

export type UpdateManualPriceInput = z.input<typeof updateManualPriceSchema>;

/**
 * Save a manually entered price. The price is stored in the instrument's
 * own currency, with source MANUAL and fetchedAt = now.
 */
export async function updateManualPrice(
  input: UpdateManualPriceInput,
): Promise<ActionResult<{ id: string; asOf: Date }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

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

  const created = await prisma.priceCache.create({
    data: {
      instrumentId: instrument.id,
      price: parsed.data.price,
      currency: instrument.currency,
      asOf: parsed.data.asOf,
      source: "MANUAL",
      fetchedAt: new Date(),
    },
  });

  revalidatePath("/portfolio");
  revalidatePath("/dashboard");
  return actionOk({ id: created.id, asOf: created.asOf });
}

"use server";

// Settings actions: base currency, manual FX rates, and the FMP FX refresh.
// FX reads/writes follow the golden rule — a pair with no rate stays typed
// "unavailable", never a silent 1.0.

import { Prisma, Currency } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  refreshFxRates as refreshFxRatesFromProvider,
  type FxRefreshReport,
} from "@/lib/data";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getOrCreatePortfolio, getSessionUserId } from "@/lib/user-portfolio";
import {
  EXTERNAL_LOOKUP_RATE_LIMIT,
  rateLimit,
  rateLimitMessage,
  userKey,
  WRITE_ACTION_RATE_LIMIT,
} from "@/lib/rate-limit";

export type { FxRefreshReport };

function revalidateMoneyPages() {
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/portfolio");
}

/**
 * Per-user write limit for the settings actions. Returns an action error
 * when the user is over the limit, or null when the write may proceed.
 */
function settingsRateLimitError(
  userId: string,
): { ok: false; error: string } | null {
  const result = rateLimit(
    userKey("settings-write", userId),
    WRITE_ACTION_RATE_LIMIT,
  );
  return result.ok ? null : actionError(rateLimitMessage(result.retryAfterSeconds));
}

/**
 * Set the signed-in user's portfolio base currency (the currency every
 * total is converted into). Creates the portfolio on first use.
 */
export async function setBaseCurrency(
  currency: Currency,
): Promise<ActionResult<{ baseCurrency: Currency }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = settingsRateLimitError(userId);
  if (limited) return limited;

  const parsed = z
    .enum(Currency, { error: "Pick a valid currency (OMR, USD, SAR or AED)." })
    .safeParse(currency);
  if (!parsed.success) {
    return actionError("Pick a valid currency (OMR, USD, SAR or AED).");
  }

  const portfolio = await getOrCreatePortfolio(userId);
  const updated = await prisma.portfolio.update({
    where: { id: portfolio.id },
    data: { baseCurrency: parsed.data },
  });

  revalidateMoneyPages();
  return actionOk({ baseCurrency: updated.baseCurrency });
}

const addFxRateSchema = z
  .object({
    base: z.enum(Currency, { error: "Pick a valid base currency." }),
    quote: z.enum(Currency, { error: "Pick a valid quote currency." }),
    rate: z.coerce
      .number({ error: "Enter the rate as a number." })
      .positive("The rate must be greater than zero."),
    asOf: z.coerce.date({ error: "Enter a valid as-of date." }),
  })
  .refine((value) => value.base !== value.quote, {
    message: "Base and quote must be two different currencies.",
  });

export type AddFxRateInput = z.input<typeof addFxRateSchema>;

/**
 * Add a manually entered FX rate (1 base = rate quote), source MANUAL.
 * The [base, quote, asOf] combination must be new — duplicates get a
 * friendly error instead of a crash.
 */
export async function addFxRate(
  input: AddFxRateInput,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = settingsRateLimitError(userId);
  if (limited) return limited;

  const parsed = addFxRateSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Please check the FX rate details.",
    );
  }

  try {
    const created = await prisma.fxRate.create({
      data: {
        base: parsed.data.base,
        quote: parsed.data.quote,
        rate: parsed.data.rate,
        asOf: parsed.data.asOf,
        source: "MANUAL",
      },
    });
    revalidateMoneyPages();
    return actionOk({ id: created.id });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return actionError(
        `A ${parsed.data.base}→${parsed.data.quote} rate for that date already exists — delete it first if you want to replace it.`,
      );
    }
    throw error;
  }
}

/** Delete one stored FX rate by id. */
export async function deleteFxRate(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = settingsRateLimitError(userId);
  if (limited) return limited;

  if (!id || typeof id !== "string") {
    return actionError("That FX rate could not be found.");
  }

  try {
    await prisma.fxRate.delete({ where: { id } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return actionError("That FX rate could not be found — it may already be deleted.");
    }
    throw error;
  }

  revalidateMoneyPages();
  return actionOk({ id });
}

/**
 * Refresh FX rates from FMP for every currency against the signed-in user's
 * base currency (daily TTL, stored in the FxRate table with source FMP).
 * The report says exactly which pairs were updated and which stayed
 * unavailable — failed pairs are never given made-up rates.
 */
export async function refreshFxRates(): Promise<ActionResult<FxRefreshReport>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  // Per-user limit: this action can reach the external FMP API, so it is
  // throttled harder than a plain database write.
  const limited = rateLimit(
    userKey("fx-refresh", userId),
    EXTERNAL_LOOKUP_RATE_LIMIT,
  );
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const portfolio = await getOrCreatePortfolio(userId);
  const report = await refreshFxRatesFromProvider(portfolio.baseCurrency);

  if (report.updated.length > 0) {
    revalidateMoneyPages();
  }
  return actionOk(report);
}

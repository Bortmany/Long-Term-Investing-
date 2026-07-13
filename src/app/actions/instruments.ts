"use server";

// Track a new instrument, and prefill its profile fields from FMP for the
// inline "new instrument" flow. GOLDEN RULE: the prefill never blocks the
// flow and never fabricates — no API key, a non-US market, or a failed fetch
// all return the typed unavailable result, and the owner types the details
// by hand instead.

import { Prisma, Currency, InstrumentType, Market } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getProfile,
  resolveProviderName,
  unavailable,
  type MarketDataCacheStore,
  type Unavailable,
} from "@/lib/data";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getSessionUserId } from "@/lib/user-portfolio";

const createInstrumentSchema = z.object({
  ticker: z
    .string({ error: "Enter a ticker symbol." })
    .trim()
    .min(1, "Enter a ticker symbol.")
    .max(20, "Ticker symbols are at most 20 characters."),
  name: z
    .string({ error: "Enter the company or fund name." })
    .trim()
    .min(1, "Enter the company or fund name.")
    .max(200, "Names are limited to 200 characters."),
  market: z.enum(Market, { error: "Pick a market (US, MSX, TADAWUL, DFM or OTHER)." }),
  currency: z.enum(Currency, { error: "Pick a valid currency (OMR, USD, SAR or AED)." }),
  type: z.enum(InstrumentType, { error: "Pick a type (Stock, ETF or REIT)." }),
  sector: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
});

export type CreateInstrumentInput = z.input<typeof createInstrumentSchema>;

/**
 * Track a new instrument. Tickers are stored uppercase and must be unique
 * per market — trying to add a duplicate returns a friendly error instead
 * of crashing.
 */
export async function createInstrument(
  input: CreateInstrumentInput,
): Promise<ActionResult<{ id: string; ticker: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const parsed = createInstrumentSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Please check the instrument details.",
    );
  }

  const data = {
    ...parsed.data,
    ticker: parsed.data.ticker.toUpperCase(),
    sector: parsed.data.sector || null,
    country: parsed.data.country || null,
  };

  try {
    const created = await prisma.instrument.create({ data });
    revalidatePath("/portfolio");
    revalidatePath("/stocks");
    revalidatePath("/watchlist");
    return actionOk({ id: created.id, ticker: created.ticker });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return actionError(
        `${data.ticker} on ${data.market} is already tracked — no need to add it again.`,
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Track a Stock (ui-spec §4.1) — the entry point that gets a brand-new ticker
// into the system: it creates the Instrument (if it doesn't exist yet) AND
// adds a WatchlistItem for the signed-in user. The dialog only asks for
// Ticker / Market / Name, so type defaults to STOCK and the currency defaults
// to a sensible per-market value (always a config attribute, never a
// displayed market figure — no golden-rule concern).
// ---------------------------------------------------------------------------

const trackStockSchema = z.object({
  ticker: z
    .string({ error: "Enter a ticker symbol." })
    .trim()
    .min(1, "Enter a ticker symbol.")
    .max(20, "Ticker symbols are at most 20 characters."),
  name: z
    .string({ error: "Enter the company or fund name." })
    .trim()
    .min(1, "Enter the company or fund name.")
    .max(200, "Names are limited to 200 characters."),
  market: z.enum(Market, {
    error: "Pick a market (US, MSX, TADAWUL, DFM or OTHER).",
  }),
});

export type TrackStockInput = z.input<typeof trackStockSchema>;

/** A sensible default currency per market — always editable data, never fabricated figures. */
function defaultCurrencyForMarket(market: Market): Currency {
  switch (market) {
    case "US":
      return "USD";
    case "MSX":
      return "OMR";
    case "TADAWUL":
      return "SAR";
    case "DFM":
      return "AED";
    case "OTHER":
      return "OMR";
  }
}

/**
 * Track a stock: create the instrument if new (tickers stored uppercase,
 * unique per market) and add it to the signed-in user's watchlist. If the
 * instrument already exists it is reused; if it is already on the watchlist
 * the call is a friendly no-op. Returns the instrument id either way.
 */
export async function trackStock(
  input: TrackStockInput,
): Promise<ActionResult<{ id: string; ticker: string; alreadyWatched: boolean }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const parsed = trackStockSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Please check the stock details.",
    );
  }

  const ticker = parsed.data.ticker.toUpperCase();
  const { market, name } = parsed.data;

  // Reuse an existing instrument (e.g. one already held) rather than failing
  // on the unique [ticker, market] constraint.
  let instrument = await prisma.instrument.findUnique({
    where: { ticker_market: { ticker, market } },
  });
  if (!instrument) {
    instrument = await prisma.instrument.create({
      data: {
        ticker,
        name,
        market,
        currency: defaultCurrencyForMarket(market),
        type: "STOCK",
      },
    });
  }

  // Add to the watchlist unless it is already there (unique per user).
  const existingWatch = await prisma.watchlistItem.findUnique({
    where: { userId_instrumentId: { userId, instrumentId: instrument.id } },
    select: { id: true },
  });
  const alreadyWatched = existingWatch !== null;
  if (!alreadyWatched) {
    await prisma.watchlistItem.create({
      data: { userId, instrumentId: instrument.id },
    });
  }

  revalidatePath("/stocks");
  revalidatePath("/portfolio");
  revalidatePath("/watchlist");
  return actionOk({ id: instrument.id, ticker: instrument.ticker, alreadyWatched });
}

export type InstrumentProfilePrefill = {
  name: string;
  sector?: string;
  country?: string;
  currency?: Currency;
};

export type PrefillResult =
  | { ok: true; data: InstrumentProfilePrefill }
  | Unavailable;

/** A throwaway cache store: the instrument has no row yet, so nothing may be written. */
function transientStore(): MarketDataCacheStore {
  return {
    async getLatestPrice() {
      return null;
    },
    async getPriceHistory() {
      return [];
    },
    async savePrice() {},
    async getFundamentals() {
      return null;
    },
    async saveFundamentals() {},
  };
}

/**
 * Prefill the "new instrument" form from FMP's company profile.
 * Only works for US-market tickers when FMP_API_KEY is set; everything else
 * returns the typed unavailable result so the form simply stays blank —
 * never a made-up name or sector.
 */
export async function prefillInstrumentProfile(
  ticker: string,
  market: Market = "US",
): Promise<PrefillResult> {
  const userId = await getSessionUserId();
  if (!userId) return unavailable("not_supported", NOT_SIGNED_IN_ERROR);

  const cleanTicker = ticker?.trim().toUpperCase();
  if (!cleanTicker) {
    return unavailable("no_data", "Enter a ticker symbol first.");
  }

  const apiKey = process.env.FMP_API_KEY ?? null;
  if (resolveProviderName(market, apiKey || null) !== "fmp") {
    if (!apiKey) {
      return unavailable(
        "no_api_key",
        "Profile prefill needs an FMP_API_KEY — fill the details in by hand.",
      );
    }
    return unavailable(
      "not_supported",
      "Profile prefill only works for US-market tickers — fill the details in by hand.",
    );
  }

  // If this ticker is already tracked, use its real row (so the profile
  // lands in the fundamentals cache); otherwise use a throwaway store so
  // nothing is written for an instrument that does not exist yet.
  const existing = await prisma.instrument.findUnique({
    where: { ticker_market: { ticker: cleanTicker, market } },
  });

  const result = await getProfile(
    existing ?? {
      id: `prefill-${cleanTicker}`,
      ticker: cleanTicker,
      market,
      currency: "USD",
    },
    existing ? {} : { store: transientStore() },
  );

  if (!result.ok) return result;

  return {
    ok: true,
    data: {
      name: result.data.name,
      sector: result.data.sector ?? undefined,
      country: result.data.country ?? undefined,
      currency: result.data.currency,
    },
  };
}

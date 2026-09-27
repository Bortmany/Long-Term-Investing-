// Server-side loader that gathers the market data used to VALUE a user's
// portfolio, and the ONE shared computation both the Dashboard and Portfolio
// pages run so their totals can never disagree.
//
// SECURITY (docs/CONVENTIONS.md, golden rule): manual prices and manual FX
// rates are USER-SCOPED (ManualPrice / ManualFxRate). A user's valuation reads
// the shared cache (FMP / SEED, written only by the server's refresh + seed
// paths) PLUS that user's OWN manual overrides — never another user's. This is
// what stops one person's hand-entered price from poisoning everyone's totals.
//
// The manual override still carries the honest "manual" badge, but only for
// the user who entered it. "Newest asOf wins" is unchanged (see
// computePortfolioValue / findRate): a fresh manual price naturally overrides
// an older shared price for that one user.

import type { Portfolio } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computePortfolioValue,
  fromPrismaFxRate,
  fromPrismaPriceCache,
  fromPrismaTransaction,
  type FxRateInput,
  type PortfolioValue,
  type PriceInput,
  type TxnInput,
} from "@/lib/portfolio";

/** The user's own manual price rows, mapped to the same shape the math uses. */
export async function loadUserMarketData(
  userId: string,
  instrumentIds: string[],
): Promise<{ prices: PriceInput[]; fxRates: FxRateInput[] }> {
  const [sharedPriceRows, manualPriceRows, sharedFxRows, manualFxRows] =
    await Promise.all([
      // Shared cache — only FMP / SEED prices live here now.
      prisma.priceCache.findMany({ where: { instrumentId: { in: instrumentIds } } }),
      // This user's OWN manual prices (never anyone else's).
      prisma.manualPrice.findMany({
        where: { userId, instrumentId: { in: instrumentIds } },
      }),
      prisma.fxRate.findMany(),
      prisma.manualFxRate.findMany({ where: { userId } }),
    ]);

  const prices: PriceInput[] = [
    ...sharedPriceRows.map(fromPrismaPriceCache),
    ...manualPriceRows.map((p) => ({
      instrumentId: p.instrumentId,
      price: p.price.toNumber(),
      currency: p.currency,
      asOf: p.asOf,
      source: "MANUAL" as const,
    })),
  ];

  const fxRates: FxRateInput[] = [
    ...sharedFxRows.map(fromPrismaFxRate),
    ...manualFxRows.map((r) => ({
      base: r.base,
      quote: r.quote,
      rate: r.rate.toNumber(),
      asOf: r.asOf,
    })),
  ];

  return { prices, fxRates };
}

export type PortfolioComputation = {
  portfolio: Portfolio;
  transactionRows: Awaited<
    ReturnType<typeof prisma.transaction.findMany>
  >;
  transactions: TxnInput[];
  instrumentIds: string[];
  prices: PriceInput[];
  fxRates: FxRateInput[];
  portfolioValue: PortfolioValue;
};

/**
 * The single source of truth both the Dashboard and Portfolio pages use, so
 * their headline totals always match (they load the SAME transactions in the
 * SAME order and run the SAME valuation). Returns null when the user has no
 * portfolio yet. The oldest portfolio is "the" portfolio (same rule as
 * getOrCreatePortfolio).
 */
export async function loadPortfolioComputation(
  userId: string,
): Promise<PortfolioComputation | null> {
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (!portfolio) return null;

  // ONE canonical order for both pages. computeHoldings also tie-breaks
  // deterministically on its own, so the result never depends on this order —
  // but keeping it identical everywhere is a second guarantee.
  const transactionRows = await prisma.transaction.findMany({
    where: { portfolioId: portfolio.id },
    orderBy: [{ tradeDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });

  const instrumentIds = [
    ...new Set(
      transactionRows
        .map((t) => t.instrumentId)
        .filter((id): id is string => id !== null),
    ),
  ];

  const { prices, fxRates } = await loadUserMarketData(userId, instrumentIds);
  const transactions = transactionRows.map(fromPrismaTransaction);

  const portfolioValue = computePortfolioValue({
    transactions,
    prices,
    fxRates,
    baseCurrency: portfolio.baseCurrency,
  });

  return {
    portfolio,
    transactionRows,
    transactions,
    instrumentIds,
    prices,
    fxRates,
    portfolioValue,
  };
}

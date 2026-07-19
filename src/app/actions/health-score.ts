"use server";

// Portfolio Health Score — the explicit "Generate" action behind the
// dashboard card and the /portfolio section AiPanel (BUILD-PLAN.md Phase 3).
//
// THE AI RULE (docs/CONVENTIONS.md): this action is the ONLY place a
// HEALTH_SCORE analysis is produced. Pages never call this on render — they
// only read back whatever is already stored in AiAnalysis. Clicking
// "Generate health score" / "Re-analyze" is what calls this.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getSessionUserId } from "@/lib/user-portfolio";
import {
  AI_GENERATION_RATE_LIMIT,
  rateLimit,
  rateLimitMessage,
  userKey,
} from "@/lib/rate-limit";
import {
  buildHealthScoreInput,
  computePortfolioValue,
  computeTrailingDividendIncome,
  fromPrismaFxRate,
  fromPrismaPriceCache,
  fromPrismaTransaction,
  type HealthScoreHolding,
} from "@/lib/portfolio";
import { ANALYSIS_MODEL } from "@/lib/ai/client";
import { runAnalysis } from "@/lib/ai/analysis";
import { healthScoreSchema } from "@/lib/ai/schemas";

/**
 * Generate (or, if nothing about the portfolio has changed since the last
 * run, silently reuse) the signed-in user's Portfolio Health Score. Always
 * scoped to the session user's own portfolio — never a client-supplied id.
 */
export async function generateHealthScore(): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("ai-health-score", userId), AI_GENERATION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const portfolio = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (!portfolio) {
    return actionError(
      "Add a holding to your portfolio before generating a health score.",
    );
  }

  const result = await runAnalysis(
    {
      userId,
      type: "HEALTH_SCORE",
      subjectType: "portfolio",
      subjectId: portfolio.id,
      model: ANALYSIS_MODEL,
      buildInput: async () => {
        const transactionRows = await prisma.transaction.findMany({
          where: { portfolioId: portfolio.id },
        });
        const instrumentIds = [
          ...new Set(
            transactionRows
              .map((t) => t.instrumentId)
              .filter((id): id is string => id !== null),
          ),
        ];

        const [priceRows, fxRows, instrumentRows] = await Promise.all([
          prisma.priceCache.findMany({ where: { instrumentId: { in: instrumentIds } } }),
          prisma.fxRate.findMany(),
          prisma.instrument.findMany({ where: { id: { in: instrumentIds } } }),
        ]);

        const transactions = transactionRows.map(fromPrismaTransaction);
        const fxRates = fxRows.map(fromPrismaFxRate);
        const instrumentById = new Map(instrumentRows.map((i) => [i.id, i]));

        const portfolioValue = computePortfolioValue({
          transactions,
          prices: priceRows.map(fromPrismaPriceCache),
          fxRates,
          baseCurrency: portfolio.baseCurrency,
        });
        const dividendIncome = computeTrailingDividendIncome(transactions, {
          baseCurrency: portfolio.baseCurrency,
          fxRates,
        });
        const dividendPayingInstrumentIds = new Set(
          transactions
            .filter((t) => t.type === "DIVIDEND" && t.instrumentId)
            .map((t) => t.instrumentId as string),
        );

        // Only holdings that could actually be valued feed the AI — an
        // unvalued position (missing price/FX rate) is left out here the
        // same way it's left out of every total on the Dashboard, never
        // padded with a guessed value.
        const holdings: HealthScoreHolding[] = [];
        for (const holding of portfolioValue.holdings) {
          if (!holding.valuation.ok) continue;
          const instrument = instrumentById.get(holding.instrumentId);
          if (!instrument) continue;
          holdings.push({
            instrumentId: holding.instrumentId,
            ticker: instrument.ticker,
            name: instrument.name,
            marketValue: holding.valuation.marketValue,
            sector: instrument.sector,
            country: instrument.country,
            market: instrument.market,
            currency: holding.currency,
          });
        }

        const input = buildHealthScoreInput({
          baseCurrency: portfolio.baseCurrency,
          holdingsValue: portfolioValue.holdingsValue,
          cashValue: portfolioValue.cashValue,
          holdings,
          dividendPayingInstrumentIds,
          trailingDividendIncome: dividendIncome.total,
        });

        // dataAsOf: the OLDEST price date behind this analysis — never
        // overstate freshness by reporting the newest of a mixed batch when
        // some holdings' prices are older.
        const priceDates = portfolioValue.holdings
          .map((h) =>
            h.valuation.ok && h.valuation.source.kind !== "derived"
              ? h.valuation.source.asOf
              : null,
          )
          .filter((d): d is Date => d !== null);
        const dataAsOf =
          priceDates.length > 0
            ? priceDates.reduce((oldest, d) => (d < oldest ? d : oldest))
            : new Date();

        return { input, dataAsOf };
      },
      schema: healthScoreSchema,
    },
  );

  if (!result.ok) return actionError(result.message);

  revalidatePath("/dashboard");
  revalidatePath("/portfolio");
  return actionOk({ id: result.analysis.id });
}

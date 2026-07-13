"use server";

// Generate (or reuse) the AI Health Score for one instrument (ui-spec §4.2).
//
// AI RULE (docs/CONVENTIONS.md): runAnalysis is called ONLY from here — an
// explicit user click on "Generate investment score" / "Re-analyze" — never
// from the page's render path. The page only READS the persisted row.
//
// GOLDEN RULE: buildInput never fabricates market data. Each source that is
// unavailable is passed to the model as `null`, not a made-up figure, and the
// data's "as of" date is the newest real asOf among the sources we did get.

import { revalidatePath } from "next/cache";
import type { AiAnalysisType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ANALYSIS_MODEL } from "@/lib/ai/client";
import { runAnalysis } from "@/lib/ai/analysis";
import { stockScoreSchema } from "@/lib/ai/schemas";
import {
  getDividendHistory,
  getFinancialStatements,
  getProfile,
  getQuote,
  type InstrumentRef,
} from "@/lib/data";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getSessionUserId } from "@/lib/user-portfolio";

const STOCK_SCORE: AiAnalysisType = "STOCK_SCORE";

/**
 * Generate the STOCK_SCORE for `instrumentId`. Returns a plain, serializable
 * result: `ok: true` once a row exists (freshly generated or reused), or an
 * `ok: false` sentence the client turns into the AiPanel's "Analysis failed"
 * / "AI is off" state. The persisted row is read back by the page on refresh.
 */
export async function generateStockScore(
  instrumentId: string,
): Promise<ActionResult<{ reused: boolean }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  if (!instrumentId || typeof instrumentId !== "string") {
    return actionError("That instrument could not be found.");
  }

  const instrument = await prisma.instrument.findUnique({
    where: { id: instrumentId },
  });
  if (!instrument) {
    return actionError("That instrument could not be found.");
  }

  const ref: InstrumentRef = {
    id: instrument.id,
    ticker: instrument.ticker,
    market: instrument.market,
    currency: instrument.currency,
  };

  const result = await runAnalysis({
    userId,
    type: STOCK_SCORE,
    subjectType: "instrument",
    subjectId: instrument.id,
    model: ANALYSIS_MODEL,
    schema: stockScoreSchema,
    buildInput: async () => {
      // Pull everything the model should see through the data barrel. Each
      // call returns a typed DataResult — unavailable sources become null.
      const [profileR, quoteR, incomeR, balanceR, cashR, dividendR] =
        await Promise.all([
          getProfile(ref),
          getQuote(ref),
          getFinancialStatements(ref, "income", "annual"),
          getFinancialStatements(ref, "balance", "annual"),
          getFinancialStatements(ref, "cash-flow", "annual"),
          getDividendHistory(ref),
        ]);

      // Collect the real "as of" dates from whatever we actually got, and use
      // the newest as the analysis's dataAsOf (falling back to now when no
      // source answered — the model then simply sees mostly-null input).
      const asOfDates: Date[] = [];
      if (profileR.ok) asOfDates.push(profileR.data.asOf);
      if (quoteR.ok) asOfDates.push(quoteR.data.asOf);
      if (incomeR.ok) asOfDates.push(incomeR.data.asOf);
      if (balanceR.ok) asOfDates.push(balanceR.data.asOf);
      if (cashR.ok) asOfDates.push(cashR.data.asOf);
      if (dividendR.ok) {
        for (const payment of dividendR.data) asOfDates.push(payment.exDate);
      }
      const dataAsOf =
        asOfDates.length > 0
          ? new Date(Math.max(...asOfDates.map((d) => d.getTime())))
          : new Date();

      const input = {
        instrument: {
          ticker: instrument.ticker,
          name: instrument.name,
          market: instrument.market,
          currency: instrument.currency,
          type: instrument.type,
          sector: instrument.sector,
          country: instrument.country,
        },
        profile: profileR.ok
          ? {
              name: profileR.data.name,
              sector: profileR.data.sector,
              industry: profileR.data.industry,
              country: profileR.data.country,
              description: profileR.data.description,
              marketCap: profileR.data.marketCap,
              currency: profileR.data.currency,
            }
          : null,
        quote: quoteR.ok
          ? {
              price: quoteR.data.price,
              currency: quoteR.data.currency,
              asOf: quoteR.data.asOf.toISOString(),
            }
          : null,
        statements: {
          income: incomeR.ok ? incomeR.data.rows : null,
          balance: balanceR.ok ? balanceR.data.rows : null,
          cashFlow: cashR.ok ? cashR.data.rows : null,
        },
        dividends: dividendR.ok
          ? dividendR.data.map((payment) => ({
              exDate: payment.exDate.toISOString(),
              amountPerShare: payment.amountPerShare,
              currency: payment.currency,
            }))
          : null,
      };

      return { input, dataAsOf };
    },
  });

  if (!result.ok) {
    // Typed unavailable (no key, provider error, schema mismatch) → a plain
    // sentence; the AiPanel shows its fixed "Analysis failed" copy. Never
    // surface a key or a raw provider error. Mirrors health-score.ts.
    return actionError(
      result.unavailable === "no_api_key"
        ? "AI features are turned off."
        : "Something went wrong generating this analysis.",
    );
  }

  revalidatePath(`/stocks/${instrument.id}`);
  return actionOk({ reused: result.data.reused });
}

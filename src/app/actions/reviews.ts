"use server";

// Weekly Review (Phase 6, BUILD-PLAN "/reviews") + per-instrument news
// summaries.
//
// AI RULE (docs/CONVENTIONS.md): runAnalysis is called ONLY from an explicit
// user click on "Run weekly review" / "Summarize news" (via the actions
// below), or from the cron route's call into the same engine, standing in
// for that click. Pages only READ the persisted WeeklyReview / AiAnalysis
// rows, never trigger generation on render.
//
// NOTE ON runWeeklyReviewForUser: the actual weekly-review logic lives in
// src/lib/reviews/weekly-review-engine.ts, NOT in this file. This file has
// `"use server"` at the top, which turns every exported function into a
// callable Server Action endpoint — a raw, unauthenticated
// `runWeeklyReviewForUser(userId)` must never live here, or a client could
// invoke it directly with an arbitrary userId. `runWeeklyReview()` below is
// the only export that touches it, and only after resolving `userId` from
// the signed-in session itself.
//
// SECURITY RULE (Phase-5-class bug, do not repeat): every AiAnalysis query
// here is scoped to `userId` — never subjectId alone.

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { FAST_MODEL } from "@/lib/ai/client";
import { runAnalysis } from "@/lib/ai/analysis";
import { newsSummarySchema } from "@/lib/ai/schemas";
import { runWeeklyReviewForUser } from "@/lib/reviews/weekly-review-engine";
import { getStockNews, type InstrumentRef } from "@/lib/data";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getSessionUserId } from "@/lib/user-portfolio";

const INSTRUMENT_NOT_FOUND_ERROR = "That instrument could not be found.";

/**
 * Run (or reuse) the signed-in user's weekly review. Thin session-guarded
 * wrapper around the engine in src/lib/reviews/weekly-review-engine.ts —
 * every UI "Run weekly review" button calls this one; the cron route calls
 * the engine directly with its own env-configured userId.
 */
export async function runWeeklyReview(): Promise<ActionResult<{ id: string; reused: boolean }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const result = await runWeeklyReviewForUser(userId);
  if (result.ok) {
    revalidatePath("/reviews");
  }
  return result;
}

// ---------------------------------------------------------------------------
// News summary
// ---------------------------------------------------------------------------

/**
 * Generate (or reuse) a NEWS_SUMMARY for one instrument. Checks for live
 * news FIRST — before ever calling runAnalysis — because there is nothing
 * honest for the model to summarize without it; this is a defensive re-check
 * (the UI is expected to already hide the button for instruments that don't
 * route to a live provider), so a direct action call must never trust that.
 */
export async function generateNewsSummary(
  instrumentId: string,
): Promise<ActionResult<{ reused: boolean }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  if (!instrumentId || typeof instrumentId !== "string") {
    return actionError(INSTRUMENT_NOT_FOUND_ERROR);
  }

  const instrument = await prisma.instrument.findUnique({ where: { id: instrumentId } });
  if (!instrument) return actionError(INSTRUMENT_NOT_FOUND_ERROR);

  const ref: InstrumentRef = {
    id: instrument.id,
    ticker: instrument.ticker,
    market: instrument.market,
    currency: instrument.currency,
  };

  const newsR = await getStockNews(ref);
  if (!newsR.ok) {
    return actionError(
      "News summaries require a live market-data connection for this instrument.",
    );
  }

  const activeThesis = await prisma.thesis.findFirst({
    where: { instrumentId, userId, status: "ACTIVE" },
  });

  const dataAsOf = newsR.data.reduce(
    (latest, item) => (item.publishedDate > latest ? item.publishedDate : latest),
    newsR.data[0].publishedDate,
  );

  const result = await runAnalysis({
    userId,
    type: "NEWS_SUMMARY",
    subjectType: "instrument",
    subjectId: instrument.id,
    // Haiku, per BUILD-PLAN's model policy for summaries — not ANALYSIS_MODEL.
    model: FAST_MODEL,
    schema: newsSummarySchema,
    buildInput: async () => ({
      input: {
        instrument: {
          ticker: instrument.ticker,
          name: instrument.name,
          market: instrument.market,
          currency: instrument.currency,
        },
        news: newsR.data.map((item) => ({
          title: item.title,
          text: item.text,
          url: item.url,
          site: item.site,
          publishedDate: item.publishedDate.toISOString(),
        })),
        // Omit the `thesis` key entirely when there is none — same "omit
        // rather than fabricate a placeholder" convention already used for
        // Committee's thesis assessment (src/lib/ai/prompts.ts,
        // COMMITTEE_SYNTHESIS_PROMPT). The model is expected to likewise omit
        // `thesisImpact` from its output whenever this key is absent.
        ...(activeThesis
          ? {
              thesis: {
                statement: activeThesis.statement,
                statedOn: activeThesis.createdAt.toISOString(),
              },
            }
          : {}),
      },
      dataAsOf,
    }),
  });

  if (!result.ok) {
    return actionError(
      result.unavailable === "no_api_key"
        ? "AI features are turned off."
        : "Something went wrong generating this analysis.",
    );
  }

  revalidatePath(`/stocks/${instrument.id}`);
  return actionOk({ reused: result.data.reused });
}

"use server";

// Create, close/reopen, and AI-check a personal investment thesis
// (ui-spec Phase 4 "Thesis Tracker").
//
// AI RULE (docs/CONVENTIONS.md): runAnalysis is called ONLY from checkThesis
// — an explicit user click on "Check thesis" / "Re-check" — never from a
// page's render path. Pages only READ the persisted ThesisCheck rows.
//
// GOLDEN RULE: buildInput never fabricates market data. Each source that is
// unavailable is passed to the model as `null` plus a plain-English note in
// `dataGaps`, and the data's "as of" date is the newest real asOf among the
// sources we did get.
//
// SECURITY RULE: every query here is scoped to the signed-in user's id.
// Ownership checks on an existing thesis all use the same
// `findFirst({ where: { id, userId } })` shape and the same "not found"
// message whether the row doesn't exist or belongs to someone else — never
// leak which.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { ANALYSIS_MODEL } from "@/lib/ai/client";
import { runAnalysis } from "@/lib/ai/analysis";
import { thesisCheckSchema } from "@/lib/ai/schemas";
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

const THESIS_NOT_FOUND_ERROR = "That thesis could not be found.";

const createThesisSchema = z.object({
  instrumentId: z.string().min(1, "That instrument could not be found."),
  statement: z
    .string()
    .trim()
    .min(
      10,
      "Write a few words about why you hold this — at least 10 characters.",
    )
    .max(2000, "Keep the thesis under 2000 characters."),
});

/**
 * Create a new ACTIVE thesis for one instrument. Returns the new thesis's id
 * so the caller can navigate to its detail page.
 */
export async function createThesis(input: {
  instrumentId: string;
  statement: string;
}): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const parsed = createThesisSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const { instrumentId, statement } = parsed.data;

  // Gate: the instrument must be one the user actually holds or watches — the
  // same held-or-watched set the New Thesis dialog is built from. This blocks a
  // direct server-action call from attaching a thesis to an arbitrary global
  // instrument id, keeping the action honest to the UI's own rule.
  const [heldTx, watched] = await Promise.all([
    prisma.transaction.findFirst({
      where: { instrumentId, portfolio: { userId } },
      select: { id: true },
    }),
    prisma.watchlistItem.findFirst({
      where: { instrumentId, userId },
      select: { id: true },
    }),
  ]);
  if (!heldTx && !watched) {
    return actionError(
      "Add this instrument as a holding or track it before writing a thesis about it.",
    );
  }

  const thesis = await prisma.thesis.create({
    data: { userId, instrumentId, statement, status: "ACTIVE" },
  });

  revalidatePath("/theses");
  return actionOk({ id: thesis.id });
}

/** Mark a thesis CLOSED (the investor no longer holds this belief / position). */
export async function closeThesis(id: string): Promise<ActionResult<null>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const thesis = await prisma.thesis.findFirst({ where: { id, userId } });
  if (!thesis) return actionError(THESIS_NOT_FOUND_ERROR);

  await prisma.thesis.update({
    where: { id: thesis.id },
    data: { status: "CLOSED" },
  });

  revalidatePath("/theses");
  revalidatePath(`/theses/${id}`);
  return actionOk(null);
}

/** Reopen a previously closed thesis back to ACTIVE. */
export async function reopenThesis(id: string): Promise<ActionResult<null>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const thesis = await prisma.thesis.findFirst({ where: { id, userId } });
  if (!thesis) return actionError(THESIS_NOT_FOUND_ERROR);

  await prisma.thesis.update({
    where: { id: thesis.id },
    data: { status: "ACTIVE" },
  });

  revalidatePath("/theses");
  revalidatePath(`/theses/${id}`);
  return actionOk(null);
}

/**
 * Generate (or reuse) the AI THESIS_CHECK for one thesis: is it still
 * holding up given the latest data? Returns `{ reused }` so the caller can
 * tell the user whether anything new was generated. The persisted
 * ThesisCheck row is read back by the page after revalidation.
 */
export async function checkThesis(
  id: string,
): Promise<ActionResult<{ reused: boolean }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const thesis = await prisma.thesis.findFirst({
    where: { id, userId },
    include: { instrument: true },
  });
  if (!thesis) return actionError(THESIS_NOT_FOUND_ERROR);

  const ref: InstrumentRef = {
    id: thesis.instrument.id,
    ticker: thesis.instrument.ticker,
    market: thesis.instrument.market,
    currency: thesis.instrument.currency,
  };

  const result = await runAnalysis({
    userId,
    type: "THESIS_CHECK",
    subjectType: "thesis",
    subjectId: thesis.id,
    model: ANALYSIS_MODEL,
    schema: thesisCheckSchema,
    buildInput: async () => {
      // Pull everything the model should see through the data barrel. Each
      // call returns a typed DataResult — unavailable sources become null,
      // and a plain-English line is pushed into dataGaps so the model reads
      // the gap directly instead of it being silently dropped.
      const [profileR, quoteR, incomeR, balanceR, cashR, dividendR] =
        await Promise.all([
          getProfile(ref),
          getQuote(ref),
          getFinancialStatements(ref, "income", "annual"),
          getFinancialStatements(ref, "balance", "annual"),
          getFinancialStatements(ref, "cash-flow", "annual"),
          getDividendHistory(ref),
        ]);

      const dataGaps: string[] = [];
      if (!profileR.ok) dataGaps.push("Company profile unavailable.");
      if (!quoteR.ok) dataGaps.push("Current quote unavailable.");
      if (!incomeR.ok) dataGaps.push("Income statement unavailable.");
      if (!balanceR.ok) dataGaps.push("Balance sheet unavailable.");
      if (!cashR.ok) dataGaps.push("Cash flow statement unavailable.");
      if (!dividendR.ok) dataGaps.push("Dividend history unavailable.");

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
        thesis: {
          statement: thesis.statement,
          statedOn: thesis.createdAt.toISOString(),
        },
        instrument: {
          ticker: thesis.instrument.ticker,
          name: thesis.instrument.name,
          market: thesis.instrument.market,
          currency: thesis.instrument.currency,
          sector: thesis.instrument.sector,
          country: thesis.instrument.country,
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
        dataGaps,
      };

      return { input, dataAsOf };
    },
  });

  if (!result.ok) {
    return actionError(
      result.unavailable === "no_api_key"
        ? "AI features are turned off."
        : "Something went wrong generating this analysis.",
    );
  }

  // Ensure exactly one ThesisCheck exists for this analysis snapshot. runAnalysis
  // has already persisted the AiAnalysis row; we dedupe on the analysis's own
  // createdAt (which we also stamp onto the ThesisCheck) rather than trusting the
  // `reused` flag. That way, if a previous attempt died AFTER the AiAnalysis was
  // saved but BEFORE this ThesisCheck was written, `reused` would come back true
  // yet no check row would exist — and this still self-heals by creating it now,
  // instead of orphaning the analysis forever.
  const existingCheck = await prisma.thesisCheck.findFirst({
    where: { thesisId: thesis.id, createdAt: result.data.createdAt },
    select: { id: true },
  });
  if (!existingCheck) {
    await prisma.thesisCheck.create({
      data: {
        thesisId: thesis.id,
        integrityScore: result.data.output.integrityScore,
        recommendation: result.data.output.recommendation,
        // Stores the FULL validated THESIS_CHECK output (score + recommendation
        // + evidence + watchItems + summary), not just the narrower "evidence"
        // sub-object the column name suggests — this keeps history/timeline
        // queries self-sufficient without joining AiAnalysis.
        evidence: result.data.output,
        model: result.data.model,
        dataAsOf: result.data.dataAsOf,
        createdAt: result.data.createdAt,
      },
    });
  }

  revalidatePath(`/theses/${id}`);
  return actionOk({ reused: result.data.reused });
}

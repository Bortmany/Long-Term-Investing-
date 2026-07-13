"use server";

// Generate (or reuse) the portfolio-level Health Score. This is the ONLY place
// runAnalysis is called for HEALTH_SCORE — triggered by the user clicking
// "Generate health score" / "Re-analyze", never on page render (AI rule in
// docs/CONVENTIONS.md). Auth is scoped to the signed-in user's server session;
// the portfolio id is resolved here, never accepted from the client.

import { revalidatePath } from "next/cache";

import { runAnalysis } from "@/lib/ai/analysis";
import { ANALYSIS_MODEL } from "@/lib/ai/client";
import { healthScoreSchema } from "@/lib/ai/schemas";
import { buildHealthScoreInput } from "@/lib/portfolio/health-input";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getOrCreatePortfolio, getSessionUserId } from "@/lib/user-portfolio";

/**
 * Run the Health Score for the signed-in user's portfolio. Returns a plain
 * ok/error result the client uses to drive AiPanel's error state — the actual
 * analysis body is re-read by the server pages after revalidation.
 */
export async function generateHealthScore(): Promise<ActionResult<null>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const portfolio = await getOrCreatePortfolio(userId);

  const result = await runAnalysis({
    userId,
    type: "HEALTH_SCORE",
    subjectType: "portfolio",
    subjectId: portfolio.id,
    model: ANALYSIS_MODEL,
    schema: healthScoreSchema,
    buildInput: () => buildHealthScoreInput(portfolio),
  });

  if (!result.ok) {
    // The panel shows fixed "Analysis failed" copy; this message is only for
    // the client's own state. Never surface a key or a raw provider error.
    return actionError(
      result.unavailable === "no_api_key"
        ? "AI features are turned off."
        : "Something went wrong generating this analysis.",
    );
  }

  // Both the dashboard card and the /portfolio section read the latest row.
  revalidatePath("/dashboard");
  revalidatePath("/portfolio");
  return actionOk(null);
}

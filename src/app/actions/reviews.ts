"use server";

// Weekly Review server action (BUILD-PLAN.md Phase 6), scoped to the
// signed-in user. The real snapshot-building + engine work lives in
// src/lib/reviews/ (shared with the scheduled cron route) — this file is
// just the session-scoped, revalidating wrapper, same skeleton as every
// other AI-generation action (src/app/actions/health-score.ts,
// src/app/actions/stocks.ts).

import { revalidatePath } from "next/cache";
import {
  actionError,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getSessionUserId } from "@/lib/user-portfolio";
import { runWeeklyReviewForUser } from "@/lib/reviews/run-for-user";

/**
 * Generate (or, if nothing about the portfolio has changed since the last
 * run, silently reuse) this week's Weekly Review. THE AI RULE: only ever
 * runs from an explicit "Run weekly review" click — never on page render.
 * Re-running within the same ISO week replaces that week's WeeklyReview row
 * rather than creating a second one (history stays one row per week).
 */
export async function runWeeklyReview(): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const result = await runWeeklyReviewForUser(userId);
  if (result.ok) {
    revalidatePath("/reviews");
    revalidatePath(`/reviews/${result.data.id}`);
  }
  return result;
}

// Runs one user's weekly review end to end — shared by the user-triggered
// server action (src/app/actions/reviews.ts) and the scheduled cron route
// (src/app/api/cron/weekly-review/route.ts), so the real snapshot-building
// logic lives in exactly one place (docs/CONVENTIONS.md: "keep pages thin;
// logic lives in src/lib/"). Not itself a Server Action — a plain
// server-side module, only ever imported by other server code.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { AI_GENERATION_RATE_LIMIT, rateLimit, rateLimitMessage, userKey } from "@/lib/rate-limit";
import { ANALYSIS_MODEL } from "@/lib/ai/client";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { buildWeeklyBriefEmail } from "@/lib/email/weekly-brief";
import { runWeeklyReviewEngine } from "./engine";
import { currentIsoPeriod } from "./period";
import { extractWeeklyReviewSnapshot } from "./output";
import { buildWeeklyReviewInput } from "./snapshot";

/**
 * Fire-and-forget the weekly-brief email for one just-persisted review. The
 * review itself has already succeeded and been upserted by the time this
 * runs — a send failure (missing user email, Resend down, etc.) must NEVER
 * fail the review, so every error path here only ever logs a warning. Only
 * ever called when isEmailConfigured() is already true, so no work happens
 * at all while the integration stays dormant.
 */
async function sendWeeklyBriefEmailForUser(
  userId: string,
  review: { id: string; period: string },
  summary: string,
): Promise<void> {
  const appBaseUrl = process.env.BETTER_AUTH_URL;
  if (!appBaseUrl) return;

  // Scoped to this one user's own row — same discipline as every other
  // user-owned query in this app.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return;

  const email = buildWeeklyBriefEmail(
    { id: review.id, period: review.period, summary },
    appBaseUrl,
  );
  const result = await sendEmail({
    to: user.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  if (!result.ok) {
    logger.warn("Weekly-brief email did not send", { unavailable: result.unavailable });
  }
}

/**
 * Every user-owned query here is scoped to `userId` (docs/CONVENTIONS.md) —
 * the caller is trusted to have already established that identity (the
 * signed-in session for the button, the bearer-secret-authenticated cron
 * loop for the scheduled path), never a client-supplied id.
 */
export async function runWeeklyReviewForUser(
  userId: string,
  now: Date = new Date(),
): Promise<ActionResult<{ id: string }>> {
  const limited = rateLimit(userKey("ai-weekly-review", userId), AI_GENERATION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const portfolio = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (!portfolio) {
    return actionError("Add a holding to your portfolio before running a weekly review.");
  }

  const period = currentIsoPeriod(now);
  // Deltas compare against the most recent PRIOR review, not necessarily last
  // calendar week — the primary path is a manual button, so users routinely
  // skip weeks. Zero-padded "YYYY-Wnn" strings sort correctly lexicographically,
  // including across year boundaries (docs/BUILD-PLAN.md line 91).
  const priorRow = await prisma.weeklyReview.findFirst({
    where: { userId, period: { lt: period } },
    orderBy: { period: "desc" },
  });
  const previousSnapshot = extractWeeklyReviewSnapshot(priorRow?.output ?? null);

  const result = await runWeeklyReviewEngine({
    userId,
    portfolioId: portfolio.id,
    period,
    model: ANALYSIS_MODEL,
    now,
    buildInput: () => buildWeeklyReviewInput({ portfolio, now, previousSnapshot }),
  });

  if (!result.ok) return actionError(result.message);

  // Fire-and-forget: this single hook covers BOTH callers of
  // runWeeklyReviewForUser (the "Run weekly review" button and the
  // scheduled cron loop below), so the email only needs wiring in one
  // place. Never awaited by the caller, and its own errors never surface
  // here — see sendWeeklyBriefEmailForUser's own doc comment.
  if (isEmailConfigured()) {
    void sendWeeklyBriefEmailForUser(userId, result.review, result.data.summary).catch((error) => {
      logger.warn("Weekly-brief email failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return actionOk({ id: result.review.id });
}

export type ScheduledWeeklyReviewSummary = {
  usersProcessed: number;
  succeeded: number;
  failed: number;
};

/**
 * Run the weekly review for EVERY user who has a portfolio (the scheduled
 * cron route's job) — one user's failure never stops the loop, and nothing
 * about any individual user (id, email, portfolio contents) is returned or
 * logged, only aggregate counts.
 */
export async function runWeeklyReviewsForAllUsers(
  now: Date = new Date(),
): Promise<ScheduledWeeklyReviewSummary> {
  const portfolios = await prisma.portfolio.findMany({
    select: { userId: true },
    distinct: ["userId"],
  });

  let succeeded = 0;
  let failed = 0;

  for (const { userId } of portfolios) {
    try {
      const result = await runWeeklyReviewForUser(userId, now);
      if (result.ok) {
        succeeded += 1;
      } else {
        failed += 1;
        logger.warn("Scheduled weekly review did not complete for one user", {
          reason: result.error,
        });
      }
    } catch (error) {
      failed += 1;
      logger.error("Scheduled weekly review threw for one user", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { usersProcessed: portfolios.length, succeeded, failed };
}

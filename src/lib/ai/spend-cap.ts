// Daily per-user cap on AI analysis generation (engineering-standards
// rate-limiting rule, applied to $-cost API calls rather than requests).
//
// UNIT OF SPEND: one persisted `AiAnalysis` row = one unit against the cap —
// NOT one Anthropic API call. A Committee run makes 6 persona calls + 1
// synthesis call but persists exactly ONE `AiAnalysis(COMMITTEE)` row, so it
// costs 1 unit here, same as a single Health Score run. This keeps the cap
// meaningful to the owner ("25 analyses a day") without needing to know how
// many model calls each analysis type happens to make under the hood.

import { prisma } from "@/lib/prisma";

export const DAILY_AI_ANALYSIS_LIMIT = 25;

/** Midnight UTC on the day containing `now` — the cap resets on this boundary. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export type SpendCapDeps = {
  /** Number of AiAnalysis rows this user has created since `since`. */
  countSince: (userId: string, since: Date) => Promise<number>;
};

async function defaultCountSince(userId: string, since: Date): Promise<number> {
  return prisma.aiAnalysis.count({
    where: { userId, createdAt: { gte: since } },
  });
}

const defaultDeps: SpendCapDeps = { countSince: defaultCountSince };

export type SpendCapResult =
  | { ok: true; remaining: number }
  | { ok: false; message: string };

/**
 * Whether `userId` may generate one more AI analysis today (UTC). Reusing an
 * existing analysis by input hash never calls this — only a genuinely new
 * generation counts against the cap.
 */
export async function checkAiSpendCap(
  userId: string,
  deps: SpendCapDeps = defaultDeps,
  now: Date = new Date(),
): Promise<SpendCapResult> {
  const since = startOfUtcDay(now);
  const count = await deps.countSince(userId, since);
  if (count >= DAILY_AI_ANALYSIS_LIMIT) {
    return {
      ok: false,
      message:
        `You've reached today's limit of ${DAILY_AI_ANALYSIS_LIMIT} new AI analyses. ` +
        "It resets at midnight UTC. Every analysis you've already generated is still " +
        "available to view — this only pauses creating new ones for today.",
    };
  }
  return { ok: true, remaining: DAILY_AI_ANALYSIS_LIMIT - count };
}

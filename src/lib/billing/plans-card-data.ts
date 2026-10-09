// Everything the Settings "Plans & billing" card shows, read on the server.
//
// The usage numbers come from readAiUsage — the SAME function the AI spend
// cap uses to decide yes or no (src/lib/ai/spend-cap.ts) — so the card can
// never disagree with what is actually enforced. If anything can't be read,
// the result is `{ ok: false }` and the card shows its error state: never
// "0 of 2", never a guessed plan (the golden rule).

import { logger } from "@/lib/logger";
import { formatShortDate } from "@/lib/format";
import { getPlanStatus, type PlanStatus } from "@/lib/plan-access";
import { readAiUsage, type AiUsage, type SpendCapDeps } from "@/lib/ai/spend-cap";
import { isBillingEnabled } from "@/lib/billing/config";
import type { PlanName } from "@/lib/plans";

export type PlansCardData =
  | { ok: false }
  | {
      ok: true;
      plan: PlanName;
      ownerGranted: boolean;
      billingEnabled: boolean;
      subscription: {
        status: string;
        interval: string;
        periodEndLabel: string | null;
        cancelAtPeriodEnd: boolean;
      } | null;
      usage: {
        usedToday: number;
        dailyLimit: number;
        usedThisMonth: number | null;
        monthlyLimit: number | null;
      };
    };

export async function loadPlansCardData(
  userId: string,
  deps: {
    getStatus?: (userId: string, now: Date) => Promise<PlanStatus>;
    readUsage?: (userId: string, deps: SpendCapDeps | undefined, now: Date) => Promise<AiUsage>;
    spendCapDeps?: SpendCapDeps;
    billingEnabled?: boolean;
    now?: Date;
  } = {},
): Promise<PlansCardData> {
  const now = deps.now ?? new Date();
  try {
    const status = await (deps.getStatus ?? getPlanStatus)(userId, now);
    const usage = await (deps.readUsage ?? readAiUsage)(userId, deps.spendCapDeps, now);
    const sub = status.subscription;
    return {
      ok: true,
      plan: usage.plan,
      ownerGranted: status.ownerGranted,
      billingEnabled: deps.billingEnabled ?? isBillingEnabled(),
      subscription: sub
        ? {
            status: sub.status,
            interval: sub.interval,
            periodEndLabel: sub.currentPeriodEnd ? formatShortDate(sub.currentPeriodEnd) : null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          }
        : null,
      usage: {
        usedToday: usage.usedToday,
        dailyLimit: usage.dailyLimit,
        usedThisMonth: usage.usedThisMonth,
        monthlyLimit: usage.monthlyLimit,
      },
    };
  } catch (error) {
    logger.error("Could not load the Plans & billing card", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { ok: false };
  }
}

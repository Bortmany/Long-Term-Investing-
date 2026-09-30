// The fixed "you've hit an AI limit" sentences (go-public spec B2), kept as
// whole strings in ONE place so tests can assert them word for word and a
// later translation only has to touch this file.
//
// Pure: no database, no environment reads — safe to import from a client
// component (AiPanel uses it to recognise a limit refusal).

import { PLAN_LIMITS, type PlanName } from "@/lib/plans";

/** Which limit refused the request. */
export type SpendCapReason = "user_daily" | "user_monthly" | "global_daily";

/** The machine-readable code an action result carries next to its sentence. */
export type AiLimitCode =
  | "AI_LIMIT_FREE_DAILY"
  | "AI_LIMIT_PRO_DAILY"
  | "AI_LIMIT_PRO_MONTHLY"
  | "AI_LIMIT_GLOBAL_DAILY";

export const AI_LIMIT_CODES: readonly AiLimitCode[] = [
  "AI_LIMIT_FREE_DAILY",
  "AI_LIMIT_PRO_DAILY",
  "AI_LIMIT_PRO_MONTHLY",
  "AI_LIMIT_GLOBAL_DAILY",
];

export const FREE_DAILY_LIMIT_MESSAGE =
  `You've used today's ${PLAN_LIMITS.FREE.dailyAi} free AI analyses. It resets at midnight UTC. ` +
  "Everything you've already generated is still available to view. " +
  "This only pauses creating new ones until then.";

/** Added to the Free daily message ONLY while billing is switched on. */
export const FREE_DAILY_PRO_HINT = `Pro allows ${PLAN_LIMITS.PRO.dailyAi} a day.`;

export const PRO_DAILY_LIMIT_MESSAGE =
  `You've reached today's limit of ${PLAN_LIMITS.PRO.dailyAi} new AI analyses. ` +
  "It resets at midnight UTC. Everything you've already generated is still available to view.";

export const PRO_MONTHLY_LIMIT_MESSAGE =
  `You've reached this month's limit of ${PLAN_LIMITS.PRO.monthlyAi} new AI analyses. ` +
  "It resets at midnight UTC on the 1st. Everything you've already generated is still available to view.";

export const GLOBAL_DAILY_LIMIT_MESSAGE =
  "InvestIQ has reached its limit of new AI analyses for today, across all users. " +
  "This isn't about your account. It resets at midnight UTC. " +
  "Everything you've already generated is still available to view.";

/** Where every "Upgrade" link points — the Plans card, never a checkout by itself. */
export const PLANS_CARD_HREF = "/settings#plans";

export function aiLimitCodeFor(reason: SpendCapReason, plan: PlanName): AiLimitCode {
  if (reason === "global_daily") return "AI_LIMIT_GLOBAL_DAILY";
  if (reason === "user_monthly") return "AI_LIMIT_PRO_MONTHLY";
  return plan === "PRO" ? "AI_LIMIT_PRO_DAILY" : "AI_LIMIT_FREE_DAILY";
}

export function aiLimitMessageFor(
  reason: SpendCapReason,
  plan: PlanName,
  billingEnabled: boolean,
): string {
  switch (aiLimitCodeFor(reason, plan)) {
    case "AI_LIMIT_GLOBAL_DAILY":
      return GLOBAL_DAILY_LIMIT_MESSAGE;
    case "AI_LIMIT_PRO_MONTHLY":
      return PRO_MONTHLY_LIMIT_MESSAGE;
    case "AI_LIMIT_PRO_DAILY":
      return PRO_DAILY_LIMIT_MESSAGE;
    case "AI_LIMIT_FREE_DAILY":
      return billingEnabled
        ? `${FREE_DAILY_LIMIT_MESSAGE} ${FREE_DAILY_PRO_HINT}`
        : FREE_DAILY_LIMIT_MESSAGE;
  }
}

/** The upgrade link shows ONLY for a Free user's daily limit while billing is on. */
export function aiLimitUpgradeHref(
  reason: SpendCapReason,
  plan: PlanName,
  billingEnabled: boolean,
): string | undefined {
  return reason === "user_daily" && plan === "FREE" && billingEnabled
    ? PLANS_CARD_HREF
    : undefined;
}

export function isAiLimitCode(code: unknown): code is AiLimitCode {
  return typeof code === "string" && (AI_LIMIT_CODES as readonly string[]).includes(code);
}

/**
 * Recognise a limit refusal from its fixed sentence alone. A safety net for
 * the few AI actions whose result doesn't pass the `code` through yet: the
 * sentences above are exact constants, so an exact match is unambiguous.
 */
export function inferAiLimitFromMessage(
  message: string,
): { code: AiLimitCode; upgradeHref?: string } | null {
  if (message === FREE_DAILY_LIMIT_MESSAGE) return { code: "AI_LIMIT_FREE_DAILY" };
  if (message === `${FREE_DAILY_LIMIT_MESSAGE} ${FREE_DAILY_PRO_HINT}`) {
    // The hint is only ever added while billing is on, so the link is allowed.
    return { code: "AI_LIMIT_FREE_DAILY", upgradeHref: PLANS_CARD_HREF };
  }
  if (message === PRO_DAILY_LIMIT_MESSAGE) return { code: "AI_LIMIT_PRO_DAILY" };
  if (message === PRO_MONTHLY_LIMIT_MESSAGE) return { code: "AI_LIMIT_PRO_MONTHLY" };
  if (message === GLOBAL_DAILY_LIMIT_MESSAGE) return { code: "AI_LIMIT_GLOBAL_DAILY" };
  return null;
}

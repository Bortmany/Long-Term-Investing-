// The AI spending limits (go-public spec B2): order, the four exact
// messages, Free 2 / Pro 10 / Pro 150 boundaries at UTC midnight and month
// rollover, the app-wide cap (default, 0, invalid), the upgrade-link rule,
// and "no bypass by rushing" (5 simultaneous → exactly 2 for Free).
import { describe, expect, it, vi } from "vitest";
import {
  checkAiSpendCap,
  createMemoryAiReservationStore,
  DEFAULT_GLOBAL_AI_DAILY_CAP,
  parseGlobalAiDailyCap,
  readAiUsage,
  startOfNextUtcDay,
  startOfNextUtcMonth,
  startOfUtcDay,
  startOfUtcMonth,
  type SpendCapDeps,
} from "@/lib/ai/spend-cap";
import { logger } from "@/lib/logger";
import type { PlanName } from "@/lib/plans";

// The four refusal sentences, word for word from the spec (B2). Written out
// here on purpose — NOT imported — so a wording change fails this test.
const FREE_DAILY =
  "You've used today's 2 free AI analyses. It resets at midnight UTC. Everything you've already generated is still available to view. This only pauses creating new ones until then.";
const PRO_DAILY =
  "You've reached today's limit of 10 new AI analyses. It resets at midnight UTC. Everything you've already generated is still available to view.";
const PRO_MONTHLY =
  "You've reached this month's limit of 150 new AI analyses. It resets at midnight UTC on the 1st. Everything you've already generated is still available to view.";
const GLOBAL_DAILY =
  "InvestIQ has reached its limit of new AI analyses for today, across all users. This isn't about your account. It resets at midnight UTC. Everything you've already generated is still available to view.";

const BILLING_ON_ENV = {
  BILLING_ENABLED: "true",
  NODE_ENV: "test",
  STRIPE_SECRET_KEY: "sk_test_fake_for_unit_tests",
  STRIPE_WEBHOOK_SECRET: "whsec_fake_for_unit_tests",
  STRIPE_PRICE_PRO_MONTHLY: "price_fake_monthly",
  STRIPE_PRICE_PRO_YEARLY: "price_fake_yearly",
};

/**
 * A fake AiAnalysis table: one creation time per saved row, per user. The
 * counts are real range counts, so the UTC-midnight and month boundaries
 * are exercised for real rather than stubbed.
 */
function fakeDeps(options: {
  plan?: PlanName;
  rows?: Record<string, Date[]>;
  env?: Record<string, string | undefined>;
  delayMs?: number;
}): SpendCapDeps & { rows: Record<string, Date[]> } {
  const rows = options.rows ?? {};
  const wait = () =>
    options.delayMs ? new Promise((r) => setTimeout(r, options.delayMs)) : Promise.resolve();
  return {
    rows,
    countSince: async (userId, since) => {
      await wait();
      return (rows[userId] ?? []).filter((d) => d >= since).length;
    },
    countAllSince: async (since) => {
      await wait();
      return Object.values(rows)
        .flat()
        .filter((d) => d >= since).length;
    },
    getPlan: async () => options.plan ?? "FREE",
    reservations: createMemoryAiReservationStore(),
    env: options.env ?? {},
  };
}

const NOW = new Date("2026-07-19T12:00:00Z");
const times = (n: number, at: Date) => Array.from({ length: n }, () => at);

describe("UTC boundaries", () => {
  it("startOfUtcDay returns midnight UTC on the same day", () => {
    expect(startOfUtcDay(new Date("2026-07-19T14:32:10.500Z"))).toEqual(
      new Date("2026-07-19T00:00:00.000Z"),
    );
  });

  it("does not roll over just before midnight, rolls over exactly at midnight", () => {
    expect(startOfUtcDay(new Date("2026-07-19T23:59:59.999Z"))).toEqual(
      new Date("2026-07-19T00:00:00.000Z"),
    );
    expect(startOfUtcDay(new Date("2026-07-20T00:00:00.000Z"))).toEqual(
      new Date("2026-07-20T00:00:00.000Z"),
    );
  });

  it("next day, month start and next month (including December → January)", () => {
    expect(startOfNextUtcDay(new Date("2026-07-31T23:00:00Z"))).toEqual(
      new Date("2026-08-01T00:00:00Z"),
    );
    expect(startOfUtcMonth(new Date("2026-07-19T12:00:00Z"))).toEqual(
      new Date("2026-07-01T00:00:00Z"),
    );
    expect(startOfNextUtcMonth(new Date("2026-12-31T23:59:59Z"))).toEqual(
      new Date("2027-01-01T00:00:00Z"),
    );
  });
});

describe("GLOBAL_AI_DAILY_CAP parsing", () => {
  it("defaults to 100 when unset or blank (never unlimited)", () => {
    expect(DEFAULT_GLOBAL_AI_DAILY_CAP).toBe(100);
    expect(parseGlobalAiDailyCap({})).toBe(100);
    expect(parseGlobalAiDailyCap({ GLOBAL_AI_DAILY_CAP: "  " })).toBe(100);
  });

  it("reads a whole number, including 0", () => {
    expect(parseGlobalAiDailyCap({ GLOBAL_AI_DAILY_CAP: "250" })).toBe(250);
    expect(parseGlobalAiDailyCap({ GLOBAL_AI_DAILY_CAP: "0" })).toBe(0);
  });

  it("a non-number falls back to 100 and logs exactly one warning", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    expect(parseGlobalAiDailyCap({ GLOBAL_AI_DAILY_CAP: "lots" })).toBe(100);
    expect(parseGlobalAiDailyCap({ GLOBAL_AI_DAILY_CAP: "-5" })).toBe(100);
    expect(parseGlobalAiDailyCap({ GLOBAL_AI_DAILY_CAP: "12.5" })).toBe(100);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/sk_|whsec_|key=/i);
    warn.mockRestore();
  });
});

describe("checkAiSpendCap — Free daily (2)", () => {
  it("allows the 2nd and refuses the 3rd with the exact Free message", async () => {
    const one = fakeDeps({ rows: { u: times(1, NOW) } });
    const allowed = await checkAiSpendCap("u", one, NOW);
    expect(allowed.ok).toBe(true);

    const two = fakeDeps({ rows: { u: times(2, NOW) } });
    const refused = await checkAiSpendCap("u", two, NOW);
    expect(refused).toMatchObject({
      ok: false,
      message: FREE_DAILY,
      reason: "user_daily",
      plan: "FREE",
      code: "AI_LIMIT_FREE_DAILY",
      resetsAt: new Date("2026-07-20T00:00:00Z"),
    });
    if (!refused.ok) expect(refused.upgradeHref).toBeUndefined();
  });

  it("with billing ON adds \"Pro allows 10 a day.\" and the upgrade link", async () => {
    const deps = fakeDeps({ rows: { u: times(2, NOW) }, env: BILLING_ON_ENV });
    const refused = await checkAiSpendCap("u", deps, NOW);
    expect(refused).toMatchObject({
      ok: false,
      message: `${FREE_DAILY} Pro allows 10 a day.`,
      upgradeHref: "/settings#plans",
    });
  });

  it("resets exactly at UTC midnight", async () => {
    const lateEvening = new Date("2026-07-19T23:59:00Z");
    const deps = fakeDeps({ rows: { u: times(2, lateEvening) } });
    const before = await checkAiSpendCap("u", deps, new Date("2026-07-19T23:59:59.999Z"));
    expect(before.ok).toBe(false);
    const after = await checkAiSpendCap("u", deps, new Date("2026-07-20T00:00:00.000Z"));
    expect(after.ok).toBe(true);
  });

  it("Free has no monthly limit (only the daily one)", async () => {
    // 60 analyses earlier this month, none today: still allowed.
    const deps = fakeDeps({ rows: { u: times(60, new Date("2026-07-05T10:00:00Z")) } });
    const result = await checkAiSpendCap("u", deps, NOW);
    expect(result.ok).toBe(true);
  });
});

describe("checkAiSpendCap — Pro daily (10) and monthly (150)", () => {
  it("allows the 10th, refuses the 11th with the exact Pro daily message and no upgrade link", async () => {
    const nine = fakeDeps({ plan: "PRO", rows: { u: times(9, NOW) }, env: BILLING_ON_ENV });
    expect((await checkAiSpendCap("u", nine, NOW)).ok).toBe(true);

    const ten = fakeDeps({ plan: "PRO", rows: { u: times(10, NOW) }, env: BILLING_ON_ENV });
    const refused = await checkAiSpendCap("u", ten, NOW);
    expect(refused).toMatchObject({
      ok: false,
      message: PRO_DAILY,
      reason: "user_daily",
      plan: "PRO",
      code: "AI_LIMIT_PRO_DAILY",
    });
    if (!refused.ok) expect(refused.upgradeHref).toBeUndefined();
  });

  it("refuses at 150 this month with the exact monthly message, resetting on the 1st", async () => {
    const earlier = new Date("2026-07-02T09:00:00Z");
    const at149 = fakeDeps({ plan: "PRO", rows: { u: times(149, earlier) } });
    expect((await checkAiSpendCap("u", at149, NOW)).ok).toBe(true);

    const at150 = fakeDeps({ plan: "PRO", rows: { u: times(150, earlier) } });
    const refused = await checkAiSpendCap("u", at150, NOW);
    expect(refused).toMatchObject({
      ok: false,
      message: PRO_MONTHLY,
      reason: "user_monthly",
      code: "AI_LIMIT_PRO_MONTHLY",
      resetsAt: new Date("2026-08-01T00:00:00Z"),
    });
  });

  it("the monthly count rolls over at midnight UTC on the 1st", async () => {
    const deps = fakeDeps({ plan: "PRO", rows: { u: times(150, new Date("2026-07-31T20:00:00Z")) } });
    const lastSecond = await checkAiSpendCap("u", deps, new Date("2026-07-31T23:59:59Z"));
    expect(lastSecond.ok).toBe(false);
    const firstOfMonth = await checkAiSpendCap("u", deps, new Date("2026-08-01T00:00:00Z"));
    expect(firstOfMonth.ok).toBe(true);
  });

  it("checks the daily limit before the monthly one", async () => {
    const deps = fakeDeps({
      plan: "PRO",
      rows: { u: times(150, NOW) },
      env: { GLOBAL_AI_DAILY_CAP: "1000" },
    });
    const refused = await checkAiSpendCap("u", deps, NOW);
    if (refused.ok) throw new Error("expected a refusal");
    expect(refused.reason).toBe("user_daily");
  });
});

describe("checkAiSpendCap — the app-wide cap comes first", () => {
  it("refuses everyone with the exact app-wide message once the day's total is reached", async () => {
    const deps = fakeDeps({
      plan: "PRO",
      rows: { others: times(5, NOW), u: [] },
      env: { ...BILLING_ON_ENV, GLOBAL_AI_DAILY_CAP: "5" },
    });
    const refused = await checkAiSpendCap("u", deps, NOW);
    expect(refused).toMatchObject({
      ok: false,
      message: GLOBAL_DAILY,
      reason: "global_daily",
      code: "AI_LIMIT_GLOBAL_DAILY",
    });
    // Pro doesn't bypass it, and there is no upgrade offer.
    if (!refused.ok) expect(refused.upgradeHref).toBeUndefined();
  });

  it("wins over a user's own limit (order: app-wide → daily → monthly)", async () => {
    const deps = fakeDeps({ rows: { u: times(2, NOW) }, env: { GLOBAL_AI_DAILY_CAP: "2" } });
    const refused = await checkAiSpendCap("u", deps, NOW);
    if (refused.ok) throw new Error("expected a refusal");
    expect(refused.reason).toBe("global_daily");
  });

  it("GLOBAL_AI_DAILY_CAP=0 pauses AI for everyone, even with nothing used", async () => {
    const deps = fakeDeps({ plan: "PRO", env: { GLOBAL_AI_DAILY_CAP: "0" } });
    const refused = await checkAiSpendCap("u", deps, NOW);
    expect(refused).toMatchObject({ ok: false, reason: "global_daily", message: GLOBAL_DAILY });
  });

  it("an invalid value behaves like the default of 100", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    const at99 = fakeDeps({ rows: { others: times(99, NOW) }, env: { GLOBAL_AI_DAILY_CAP: "abc" } });
    expect((await checkAiSpendCap("u", at99, NOW)).ok).toBe(true);
    const at100 = fakeDeps({ rows: { others: times(100, NOW) }, env: { GLOBAL_AI_DAILY_CAP: "abc" } });
    const refused = await checkAiSpendCap("u", at100, NOW);
    if (refused.ok) throw new Error("expected a refusal");
    expect(refused.reason).toBe("global_daily");
    vi.restoreAllMocks();
  });
});

describe("checkAiSpendCap — no bypass by rushing", () => {
  it("5 simultaneous requests from a Free user with 0 used → exactly 2 proceed", async () => {
    const deps = fakeDeps({ rows: { u: [] }, delayMs: 5 });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => checkAiSpendCap("u", deps, NOW)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    const refused = results.filter((r) => !r.ok);
    expect(refused).toHaveLength(3);
    for (const r of refused) if (!r.ok) expect(r.message).toBe(FREE_DAILY);
  });

  it("a released reservation frees the slot again; releasing twice is harmless", async () => {
    const deps = fakeDeps({ rows: { u: [] } });
    const first = await checkAiSpendCap("u", deps, NOW);
    const second = await checkAiSpendCap("u", deps, NOW);
    expect(first.ok && second.ok).toBe(true);
    expect((await checkAiSpendCap("u", deps, NOW)).ok).toBe(false);

    if (first.ok) {
      first.release?.();
      first.release?.();
    }
    const third = await checkAiSpendCap("u", deps, NOW);
    expect(third.ok).toBe(true);
    expect((await checkAiSpendCap("u", deps, NOW)).ok).toBe(false);
  });

  it("in-flight runs also count against the app-wide cap", async () => {
    const deps = fakeDeps({ plan: "PRO", env: { GLOBAL_AI_DAILY_CAP: "1" } });
    const a = await checkAiSpendCap("a", deps, NOW);
    const b = await checkAiSpendCap("b", deps, NOW);
    expect(a.ok).toBe(true);
    expect(b).toMatchObject({ ok: false, reason: "global_daily" });
  });
});

describe("readAiUsage — the one reader behind both the cap and the Plans card", () => {
  it("reports the same numbers the cap decides on", async () => {
    const deps = fakeDeps({
      plan: "PRO",
      rows: { u: [...times(3, NOW), ...times(31, new Date("2026-07-03T08:00:00Z"))] },
    });
    const usage = await readAiUsage("u", deps, NOW);
    expect(usage).toEqual({
      plan: "PRO",
      usedToday: 3,
      dailyLimit: 10,
      usedThisMonth: 34,
      monthlyLimit: 150,
      globalUsedToday: 3,
      globalLimit: 100,
    });
  });

  it("Free shows no monthly figure", async () => {
    const usage = await readAiUsage("u", fakeDeps({ rows: { u: times(1, NOW) } }), NOW);
    expect(usage.usedThisMonth).toBeNull();
    expect(usage.monthlyLimit).toBeNull();
    expect(usage.dailyLimit).toBe(2);
  });

  it("a database failure throws — it never pretends usage is zero", async () => {
    const deps = fakeDeps({});
    deps.countSince = async () => {
      throw new Error("database unreachable");
    };
    await expect(readAiUsage("u", deps, NOW)).rejects.toThrow();
    await expect(checkAiSpendCap("u", deps, NOW)).rejects.toThrow();
  });
});

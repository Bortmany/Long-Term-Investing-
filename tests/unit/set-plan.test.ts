// The owner's `npm run plan:set` logic (go-public spec B6): flips a user to
// Pro and back, refuses an unknown email, refuses a Stripe-owned plan unless
// --force, and never prints anything secret.
import { describe, expect, it, vi } from "vitest";
import { parseSetPlanArgs, setPlanByEmail, type SetPlanDb } from "@/lib/billing/set-plan";
import type { PlanName } from "@/lib/plans";

function fakeDb(
  users: Record<
    string,
    { plan: PlanName; subscription?: { providerSubscriptionId: string | null; status: string } }
  >,
) {
  const updates: [string, PlanName][] = [];
  const db: SetPlanDb = {
    findUserByEmail: async (email) => {
      const user = users[email];
      return user
        ? { id: `id-${email}`, email, plan: user.plan, subscription: user.subscription ?? null }
        : null;
    },
    updatePlan: vi.fn(async (userId: string, plan: PlanName) => {
      updates.push([userId, plan]);
      const email = userId.replace(/^id-/, "");
      users[email].plan = plan;
    }),
  };
  return { db, updates, users };
}

describe("parseSetPlanArgs", () => {
  it("reads --email, --plan (any case) and --force", () => {
    expect(parseSetPlanArgs(["--email", "a@b.test", "--plan", "pro"])).toEqual({
      email: "a@b.test",
      plan: "PRO",
      force: false,
    });
    expect(parseSetPlanArgs(["--email=a@b.test", "--plan=FREE", "--force"])).toEqual({
      email: "a@b.test",
      plan: "FREE",
      force: true,
    });
  });

  it("explains the usage when something is missing or unknown", () => {
    expect(parseSetPlanArgs(["--email", "a@b.test"])).toHaveProperty("error");
    expect(parseSetPlanArgs(["--who", "x"])).toHaveProperty("error");
  });
});

describe("setPlanByEmail", () => {
  it("flips a user to Pro and back, reporting old and new plan", async () => {
    const { db, users } = fakeDb({ "tester@investiq.test": { plan: "FREE" } });
    expect(await setPlanByEmail(db, { email: "tester@investiq.test", plan: "PRO", force: false })).toEqual({
      ok: true,
      email: "tester@investiq.test",
      oldPlan: "FREE",
      newPlan: "PRO",
      warning: undefined,
    });
    expect(users["tester@investiq.test"].plan).toBe("PRO");
    const back = await setPlanByEmail(db, { email: "tester@investiq.test", plan: "FREE", force: false });
    expect(back).toMatchObject({ ok: true, oldPlan: "PRO", newPlan: "FREE" });
  });

  it("refuses an unknown email and changes nothing", async () => {
    const { db, updates } = fakeDb({});
    const result = await setPlanByEmail(db, { email: "nobody@investiq.test", plan: "PRO", force: false });
    expect(result).toEqual({
      ok: false,
      message: "No account uses the email nobody@investiq.test. Nothing was changed.",
    });
    expect(updates).toHaveLength(0);
  });

  it("refuses a user whose plan is owned by a Stripe subscription, unless --force", async () => {
    const { db, updates } = fakeDb({
      "payer@investiq.test": {
        plan: "PRO",
        subscription: { providerSubscriptionId: "sub_123", status: "active" },
      },
    });
    const refused = await setPlanByEmail(db, { email: "payer@investiq.test", plan: "FREE", force: false });
    expect(refused.ok).toBe(false);
    expect(updates).toHaveLength(0);

    const forced = await setPlanByEmail(db, { email: "payer@investiq.test", plan: "FREE", force: true });
    expect(forced).toMatchObject({ ok: true, newPlan: "FREE" });
    if (forced.ok) expect(forced.warning).toContain("Stripe");
  });

  it("a started-but-unfinished checkout (customer only, no subscription) doesn't block", async () => {
    const { db } = fakeDb({
      "browser@investiq.test": {
        plan: "FREE",
        subscription: { providerSubscriptionId: null, status: "checkout_started" },
      },
    });
    const result = await setPlanByEmail(db, { email: "browser@investiq.test", plan: "PRO", force: false });
    expect(result).toMatchObject({ ok: true, newPlan: "PRO" });
  });

  it("rejects a plan name that isn't PRO or FREE", async () => {
    const { db } = fakeDb({ "t@investiq.test": { plan: "FREE" } });
    const result = await setPlanByEmail(db, { email: "t@investiq.test", plan: "GOLD", force: false });
    expect(result.ok).toBe(false);
  });

  it("nothing it returns contains a secret-looking value", async () => {
    const { db } = fakeDb({ "t@investiq.test": { plan: "FREE" } });
    const result = await setPlanByEmail(db, { email: "t@investiq.test", plan: "PRO", force: false });
    expect(JSON.stringify(result)).not.toMatch(/sk_|whsec_|password|postgres(ql)?:\/\//i);
  });
});

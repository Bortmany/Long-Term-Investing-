// The owner's "give someone Pro by hand" logic (go-public spec B6), used by
// scripts/set-plan.ts (`npm run plan:set -- --email x --plan PRO|FREE`).
//
// Kept free of app-only imports (type imports only) so the command-line
// script can load it directly. No network calls, no passwords, no secrets.

import type { PlanName } from "../plans";

export type SetPlanDb = {
  findUserByEmail: (email: string) => Promise<{
    id: string;
    email: string;
    plan: PlanName;
    subscription: { providerSubscriptionId: string | null; status: string } | null;
  } | null>;
  updatePlan: (userId: string, plan: PlanName) => Promise<void>;
};

export type SetPlanArgs = { email: string; plan: string; force: boolean };

export type SetPlanResult =
  | { ok: true; email: string; oldPlan: PlanName; newPlan: PlanName; warning?: string }
  | { ok: false; message: string };

const USAGE =
  "Usage: npm run plan:set -- --email someone@example.com --plan PRO (or --plan FREE) [--force]";

export function parseSetPlanArgs(argv: string[]): SetPlanArgs | { error: string } {
  let email = "";
  let plan = "";
  let force = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") force = true;
    else if (arg === "--email") email = argv[++i] ?? "";
    else if (arg.startsWith("--email=")) email = arg.slice("--email=".length);
    else if (arg === "--plan") plan = argv[++i] ?? "";
    else if (arg.startsWith("--plan=")) plan = arg.slice("--plan=".length);
    else return { error: `Unknown option "${arg}". ${USAGE}` };
  }
  if (!email || !plan) return { error: USAGE };
  return { email: email.trim(), plan: plan.trim().toUpperCase(), force };
}

export async function setPlanByEmail(db: SetPlanDb, args: SetPlanArgs): Promise<SetPlanResult> {
  if (args.plan !== "PRO" && args.plan !== "FREE") {
    return { ok: false, message: `The plan must be PRO or FREE, not "${args.plan}".` };
  }
  const newPlan = args.plan as PlanName;

  const user = await db.findUserByEmail(args.email.toLowerCase());
  if (!user) {
    return { ok: false, message: `No account uses the email ${args.email}. Nothing was changed.` };
  }

  // A real Stripe subscription owns this person's plan; changing it by hand
  // would be undone (or contradicted) by the next billing event.
  let warning: string | undefined;
  if (user.subscription?.providerSubscriptionId) {
    if (!args.force) {
      return {
        ok: false,
        message:
          `${user.email} has a Stripe subscription (status: ${user.subscription.status}), so Stripe ` +
          "owns their plan. Nothing was changed. Add --force to change it anyway.",
      };
    }
    warning =
      "This user has a Stripe subscription. The next billing event from Stripe may change the plan again.";
  }

  if (user.plan !== newPlan) await db.updatePlan(user.id, newPlan);
  return { ok: true, email: user.email, oldPlan: user.plan, newPlan, warning };
}

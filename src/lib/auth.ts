import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

/**
 * Sign-up gating (ALLOW_SIGNUPS): sign-ups are CLOSED unless the environment
 * variable is set to the literal string "true" — the safe default for a
 * private, single-owner tool. When closed, Better Auth rejects sign-up
 * attempts server-side (disableSignUp) and the /sign-up page shows a
 * registration-closed message instead of the form.
 */
export function signUpsAllowed(): boolean {
  return process.env.ALLOW_SIGNUPS === "true";
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: !signUpsAllowed(),
  },
  // Delete-my-account (engineering-standards.md §6). No
  // sendDeleteAccountVerification callback is set, so — per Better Auth's own
  // docs — the account is deleted immediately once the caller's password is
  // verified (src/app/actions/account.ts always supplies one); there is no
  // separate email-confirmation step to build, which matters here because
  // RESEND_API_KEY is optional/dormant and account deletion must work
  // without it. The database's ON DELETE CASCADE (see prisma/migrations)
  // wipes every dependent row — sessions, portfolios, transactions, theses,
  // alerts, AI analyses — the moment the user row goes.
  user: {
    deleteUser: {
      enabled: true,
    },
  },
});

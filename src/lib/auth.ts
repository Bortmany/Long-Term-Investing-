import { betterAuth } from "better-auth";
import { createEmailVerificationToken } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/email/send";
import { sendAuthEmail } from "@/lib/email/auth-emails";

/** How long the emailed links work, in seconds. */
export const VERIFICATION_LINK_SECONDS = 24 * 60 * 60; // 24 hours
export const RESET_LINK_SECONDS = 60 * 60; // 1 hour

/**
 * Sign-up gating. Sign-ups are OPEN by default. Two things close them:
 * - SIGNUPS_PAUSED="true" — the owner's off-switch ("paused").
 * - In production, email isn't set up (RESEND_API_KEY / RESEND_FROM), so we
 *   couldn't send the "confirm your email" message ("email_unavailable").
 * Everywhere else (local dev, tests) they stay open even without email.
 */
export type SignUpStatus =
  | { open: true }
  | { open: false; reason: "paused" | "email_unavailable" };

export function getSignUpStatus(): SignUpStatus {
  if (process.env.SIGNUPS_PAUSED === "true") return { open: false, reason: "paused" };
  if (!isEmailConfigured() && process.env.NODE_ENV === "production") {
    return { open: false, reason: "email_unavailable" };
  }
  return { open: true };
}

/** Shorthand kept for existing callers: true when sign-ups are open. */
export function signUpsAllowed(): boolean {
  return getSignUpStatus().open;
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  // Turn OFF Better Auth's built-in rate limiter. It keys on the raw request
  // IP, which — when the app is NOT behind a trusted proxy (our default) —
  // collapses to one shared value for every visitor and 429s the whole app
  // after a handful of total requests (a shared-bucket denial of service).
  // We do our own limiting in the auth route wrapper
  // (src/app/api/auth/[...all]/route.ts): a stable signed PER-BROWSER id plus a
  // per-account / per-token key, which covers every sensitive auth POST
  // (sign-in, sign-up, forget-password, reset-password) without making
  // separate browsers share one bucket. Leaving Better Auth's limiter on would
  // re-introduce exactly the DoS ours removes, one layer lower.
  rateLimit: {
    enabled: false,
  },
  // Email rules (go-public spec A8). With email set up (RESEND_API_KEY and
  // RESEND_FROM): a new account must confirm its address before it can sign
  // in, and reset links work. Without email: confirmation isn't required
  // (nobody could ever get in otherwise) — and in production sign-ups are
  // refused altogether by getSignUpStatus() above.
  //
  // Every account email goes through sendAuthEmail, which records honestly
  // whether it was sent so the screens never pretend
  // (src/lib/email/auth-emails.ts).
  emailAndPassword: {
    enabled: true,
    // Read once at startup. The auth route wrapper ALSO checks
    // getSignUpStatus() on every sign-up request.
    disableSignUp: !signUpsAllowed(),
    requireEmailVerification: isEmailConfigured(),
    resetPasswordTokenExpiresIn: RESET_LINK_SECONDS,
    // A password reset signs the account out everywhere.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url, token }) => {
      await sendAuthEmail({
        kind: "reset",
        to: user.email,
        name: user.name,
        token,
        betterAuthUrl: url,
      });
    },
    // Someone signed up with an address that already has an account. Better
    // Auth answers exactly as for a new sign-up (so the screen can't reveal
    // whether the address is registered); we make that answer TRUE by really
    // emailing the address: a fresh confirmation link if it was never
    // confirmed, otherwise a short "you already have an account" note.
    onExistingUserSignUp: async ({ user }) => {
      if (!user.emailVerified) {
        const context = await auth.$context;
        const token = await createEmailVerificationToken(
          context.secret,
          user.email,
          undefined,
          VERIFICATION_LINK_SECONDS,
        );
        await sendAuthEmail({ kind: "verify", to: user.email, name: user.name, token });
        return;
      }
      await sendAuthEmail({ kind: "existing_account", to: user.email, name: user.name });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url, token }) => {
      await sendAuthEmail({
        kind: "verify",
        to: user.email,
        name: user.name,
        token,
        betterAuthUrl: url,
      });
    },
    sendOnSignUp: isEmailConfigured(),
    // Signing in with the right password to an unconfirmed account sends a
    // fresh link (counted against the per-address hourly email limit).
    sendOnSignIn: isEmailConfigured(),
    // Clicking the link signs the person in (then our /verify-email page
    // sends them on to the dashboard with "Email confirmed").
    autoSignInAfterVerification: true,
    expiresIn: VERIFICATION_LINK_SECONDS,
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

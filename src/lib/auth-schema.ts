// Zod v4 schemas for the sign-in / sign-up forms. Same shape/style as
// src/lib/alert-schema.ts and src/lib/transaction-schema.ts, kept in one file
// so both pages check email and password exactly the same way.
//
// Server side: nothing here needs re-running by hand. The forms post straight
// to Better Auth's own endpoints (/api/auth/sign-in/email and
// /api/auth/sign-up/email), and Better Auth validates the body with the same
// zod v4 `z.email()` check before it touches the database — see
// node_modules/better-auth/dist/api/routes/sign-in.mjs and sign-up.mjs. So the
// email shape is enforced twice (browser + server) without us duplicating a
// route handler.

import { z } from "zod";

/**
 * A real email shape — something before the @, a domain, and a dot-ending
 * (name@domain.tld). Deliberately NOT a list of allowed providers: work and
 * custom-domain addresses have to keep working.
 */
export const emailSchema = z
  .string({ error: "Enter your email address." })
  .trim()
  .min(1, "Enter your email address.")
  .pipe(z.email("Enter a real email address, like Ahmed@gmail.com."));

/** Passwords are 8+ characters, matching what Better Auth accepts. */
export const passwordSchema = z
  .string({ error: "Enter your password." })
  .min(1, "Enter your password.")
  .min(8, "Your password needs to be at least 8 characters.");

/** One shared look for a field that failed validation — import everywhere. */
export const errorFieldClass =
  "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500";

const nameSchema = z
  .string({ error: "Enter your name." })
  .trim()
  .min(1, "Enter your name, for example Ahmed Al Balushi.");

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

/** Reset-password form: new password twice, same rules as sign-up. */
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string({ error: "Enter your new password again." }).min(1, "Enter your new password again."),
  })
  .refine((value) => value.password === value.confirm, {
    message: "The two passwords don't match.",
    path: ["confirm"],
  });

/** Forgot-password and "send a new link" forms: just the email. */
export const emailOnlySchema = z.object({ email: emailSchema });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

// ---------------------------------------------------------------------------
// Account-access wording, kept as whole sentences in ONE place (go-public
// spec: never glue fragments; easy to translate later). Used by both the
// server (src/app/api/auth/[...all]/route.ts) and the screens.
// ---------------------------------------------------------------------------

/** Whether the account email for a sign-up / sign-in actually went out. */
export type EmailDelivery = "sent" | "failed" | "rate_limited" | "not_needed";

export const SIGNUPS_PAUSED_TITLE = "New sign-ups are paused right now";
export const SIGNUPS_PAUSED_MESSAGE =
  "We've paused new accounts for a little while. If you already have an account, you can sign in as usual.";
export const SIGNUPS_UNAVAILABLE_TITLE = "Sign-ups are unavailable right now";
export const SIGNUPS_UNAVAILABLE_MESSAGE =
  "New sign-ups are unavailable right now because we can't send confirmation emails. Please check back soon.";
export const EMAIL_NOT_SET_UP_NOTE =
  "Email isn't set up on this server, so we can't confirm your address or send password resets.";

export const TOO_MANY_ATTEMPTS_MESSAGE = "Too many attempts. Please wait a few minutes and try again.";
export const SERVER_ERROR_NOTHING_SAVED =
  "Something went wrong on our side. Nothing was saved. Please try again.";
export const SERVER_ERROR_MESSAGE = "Something went wrong on our side. Please try again.";

/** Server-side wording (no address); screens show the fuller sentences below. */
export const EMAIL_SEND_LIMITED_MESSAGE =
  "You've asked for several emails. Please wait about an hour and try again.";
export const EMAIL_SEND_FAILED_MESSAGE = "We couldn't send the email just now. Please try again in a minute.";

export function emailSendFailedMessage(contact: string): string {
  return `We couldn't send the email just now. Try Resend in a minute. If it keeps failing, contact us at ${contact}.`;
}
export function emailSendLimitedMessage(contact: string): string {
  return `You've asked for several emails. Please wait about an hour or contact us at ${contact}.`;
}
export function resetSendLimitedMessage(contact: string): string {
  return `You've asked for several reset links. Please wait about an hour or contact us at ${contact}.`;
}

export const UNCONFIRMED_SENT_MESSAGE = "Please confirm your email first. We've sent you a new link.";
export const UNCONFIRMED_FAILED_MESSAGE =
  "Please confirm your email first. We tried to send you a new link but couldn't. Try again below.";
export const UNCONFIRMED_LIMITED_MESSAGE =
  "Please confirm your email first. We've already sent you several links in the last hour, so please check your inbox and spam folder.";
export const INCORRECT_CREDENTIALS_MESSAGE = "Incorrect email or password.";

/** "0:42" style countdown label text. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

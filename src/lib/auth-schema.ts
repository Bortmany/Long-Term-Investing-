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

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

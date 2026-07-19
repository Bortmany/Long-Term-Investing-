"use server";

// Delete-my-account (engineering-standards.md §6 — data rights wherever
// accounts exist: "delete-my-account, password-confirmed, rate-limited like
// login, wipes everything"). Rate limited on BOTH the signed-in user's id
// and the caller's IP with the same AUTH_RATE_LIMIT sign-in uses, so
// repeated wrong-password guesses can't be used to brute-force the way in.
//
// The password is verified by Better Auth itself (auth.api.deleteUser,
// enabled in src/lib/auth.ts) — this action never compares a password by
// hand. On success Better Auth deletes the user row and clears the session
// cookie; the database's ON DELETE CASCADE (prisma/migrations) wipes every
// dependent row (sessions, portfolios, transactions, theses, alerts,
// notifications, AI analyses) in the same transaction as the user delete.

import { headers } from "next/headers";
import { APIError } from "better-auth";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getSessionUserId } from "@/lib/user-portfolio";
import {
  AUTH_RATE_LIMIT,
  getClientIp,
  ipKey,
  rateLimit,
  rateLimitMessage,
  userKey,
} from "@/lib/rate-limit";

const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm."),
});

export type DeleteAccountInput = z.input<typeof deleteAccountSchema>;

export async function deleteMyAccount(
  input: DeleteAccountInput,
): Promise<ActionResult<{ redirectTo: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const headerList = await headers();
  const ip = getClientIp(headerList);

  // Both keys are checked (and both counted) on every attempt — a wrong
  // password can't be retried past either limit by itself.
  const limitedByUser = rateLimit(userKey("delete-account", userId), AUTH_RATE_LIMIT);
  const limitedByIp = rateLimit(ipKey("delete-account", ip), AUTH_RATE_LIMIT);
  if (!limitedByUser.ok) return actionError(rateLimitMessage(limitedByUser.retryAfterSeconds));
  if (!limitedByIp.ok) return actionError(rateLimitMessage(limitedByIp.retryAfterSeconds));

  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Enter your password to confirm.");
  }

  try {
    await auth.api.deleteUser({
      headers: headerList,
      body: { password: parsed.data.password },
    });
  } catch (error) {
    if (error instanceof APIError) {
      // Better Auth uses this same status for "wrong password" and "no
      // credential account found" — one honest, non-specific message either
      // way avoids confirming which is true to an attacker.
      return actionError("That password is incorrect. Please try again.");
    }
    logger.error("Account deletion failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return actionError("Something went wrong deleting your account. Please try again.");
  }

  return actionOk({ redirectTo: "/sign-in" });
}

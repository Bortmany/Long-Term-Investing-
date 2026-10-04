"use server";

// Settings switch for the Sharia screen badge. The user id comes from the
// SESSION only. The real work is in src/lib/sharia/preference.ts.

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { actionError, NOT_SIGNED_IN_ERROR, type ActionResult } from "@/lib/action-result";
import { getSessionUserId } from "@/lib/user-portfolio";
import { applyShariaPreference, type BackfillOutcome } from "@/lib/sharia/preference";

export async function setShariaScreenEnabled(
  enabled: boolean,
): Promise<ActionResult<{ enabled: boolean; backfill: BackfillOutcome }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const result = await applyShariaPreference(userId, enabled, {
    // Background work runs after the answer is sent; the page never waits.
    schedule: (work) => after(work),
  });
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/portfolio");
    revalidatePath("/watchlist");
    revalidatePath("/stocks/[id]", "page");
  }
  return result;
}
